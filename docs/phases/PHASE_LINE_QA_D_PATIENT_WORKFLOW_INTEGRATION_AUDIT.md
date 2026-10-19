# Phase LINE-QA.D — Patient LINE-to-DEMI Workflow Integration Audit

**Date:** 2026-10-19
**Starting HEAD:** `77ece3e1087498ea9811a6c4a1a6f56bd53815e1` (matches the required baseline)
**Branch:** `feat/line-qa-d-patient-workflow`
**Final commit:** the single D commit that adds this file (see section 13)
**Status:** Audit complete. Four verified gaps fixed with focused tests. No authorization semantics, Account LIFF, MINI App, Rich Menu catalog/asset, LINE Console, environment, schema or production data was changed.

Scope: the five Patient Rich Menu actions that open ordinary DEMI Web routes (`OPEN_PATIENT_WORKSPACE`, `OPEN_PATIENT_APPOINTMENTS`, `OPEN_PATIENT_WELLNESS`, `OPEN_PATIENT_MEDICATIONS`, `OPEN_PATIENT_CARE`). LINE stays a navigation entry point. Same method and structure as [C1](./PHASE_LINE_QA_C1_OSM_WORKFLOW_INTEGRATION_AUDIT.md).

## 1. Shared entry path (D1)

| Step | Source | Behavior | Result |
| --- | --- | --- | --- |
| Rich Menu intent → URL | `src/modules/line/domain/line-navigation-intents.ts` `LINE_WEB_NAVIGATION_PATHS` | Each of the five intents maps to one fixed path under `/app/personal`. No Patient, relationship or resource ID is in the URL. | PASS |
| Proxy allowlist | `proxy.ts`; `getLineQuickActionReturnPathFromUrl`; `LINE_QUICK_ACTION_RETURN_PATHS` | All five paths are in the finite list. The proxy sets `x-demi-line-quick-action-return-to` only on an exact `pathname+search` match. | PASS |
| No-session login | `app/app/layout.tsx` `resolveProtectedActor`; each page loader (`patient-self-page-context.ts`, `patient-self-care-page-context.ts`, `wellness/page.tsx`, `medications/page.tsx`) | `UnauthenticatedError` → `buildLoginReturnHref(<fixed intent path>)`. | PASS |
| returnTo validation | `src/modules/auth/schemas/login-schema.ts` `loginReturnToSchema`; `login-return.ts` | Exact-string allowlist; anything else falls back to `/app` (C1 evidence unchanged). | PASS |
| Arrival re-authorization | `getProtectedApplicationActor` + SELF services (`assertPatientSelfReadPolicy`, `resolvePersonalExerciseOwner`, `resolvePersonalMedicationOwner`) | The actor and its persisted PATIENT role / PatientProfile are re-read on every request. A login return grants nothing. | PASS |
| Session expiry mid-flow | Server actions: `exercises`/`meals`/`medications`/`appointments` `transport/server-actions.ts` map `UNAUTHENTICATED` to a denied/error state; `patient-self-measurements` returns the generic error | Fail closed: nothing is written and no success is shown. The next page load redirects to login with the fixed return path. | PASS (copy note, section 10 Q3) |
| Stale Rich Menu / roles changed (e.g. workforce-only account opens the Patient menu) | before: `redirect("/app")` on `ForbiddenError` in all five entries | Silent redirect to Work home, no explanation. | **GAP-1 — fixed** |

## 2. Workflow traces (D2)

### A. Appointments — `OPEN_PATIENT_APPOINTMENTS` → `/app/personal/appointments`

| Step | Source | Result |
| --- | --- | --- |
| Hospital selection | `appointments/page.tsx` → `listOwnPatientRelationshipNavigation` (own Person + ACTIVE User + PATIENT role); `patient-self-relationship-navigation.tsx` shows Hospital name, HN, Hospital status, ended badge per relationship | PASS |
| List | `getOwnPatientAppointmentHistory`; `PatientSelfAppointmentHistoryContent` begins with `PatientSelfHospitalContext`, so each list is attributed to exactly one Hospital | PASS |
| Multi-Hospital Patient | One card per relationship; history and detail are scoped by `relationshipId` and re-checked for ownership | PASS |
| Detail | `[appointmentId]/page.tsx` → `getOwnPatientAppointmentDetail` + `getAppointmentRescheduleHistory` | PASS |
| Phone visibility (E4) | `AppointmentContactPhoneEntries showPatientPhone={false}` in `patient-self-appointment-content.tsx` | PASS |
| Acknowledge / cancellation request | `patient-appointment-interaction-controls.tsx`: allowed only for `SCHEDULED`, ACTIVE Hospital, care not ended; `useMutationActionState` + `UnknownOutcomeAlert` resend with the same nonce | PASS |
| Reschedule request (WB-DF-06) | `reschedule-request-section.tsx`: form only when `canRequest && scheduled` and no PENDING request; `appointment-reschedule-history-service.ts` derives `canRequest` from `patientSelf` scope or ACTIVE + not-ended relationship | PASS |
| Ended relationship (Phase F) | `resolveAppointmentAccessContext` filters `activePatientHospitalRelationshipWhere` (fails closed); UI shows "สิ้นสุดการดูแลแล้ว" badge and the read-only Alert; no controls rendered | PASS |
| MINI consistency | `src/modules/line/transport/workflow-scoped-appointments.ts` uses the same `listOwnPatientRelationshipNavigation` / `getOwnPatientAppointmentHistory` / `getOwnPatientAppointmentDetail` and the shared `PatientSelfAppointment*Content`; same appointment set and states | PASS |
| MINI divergence | MINI shows reschedule history read-only and offers no reschedule request; Web offers the request. Already recorded in the B2.1 deferred-deviation note and B2.2 §14 as pending product acceptance. Not unified here. | Reported (Q1) |

### B. Wellness — `OPEN_PATIENT_WELLNESS` → `/app/personal/wellness`

| Step | Source | Result |
| --- | --- | --- |
| SELF access | `resolvePersonalExerciseOwner` (PATIENT role, ACTIVE User, PatientProfile) | PASS |
| Exercise create idempotency | `personal-exercise-service.ts` `personalExerciseCreateReceipt` keyed by `(patientProfileId, submissionNonce)`; replay returns the first entry; consumed nonce → `CREATE_CONSUMED` | PASS |
| Exercise unknown outcome | `personal-exercise-controls.tsx`: network failure → `UNCONFIRMED`, keeps the same nonce and offers "ลองคำขอเดิมอีกครั้ง" | PASS (note Q2) |
| Self-measurements reachable from the Wellness destination | before: no link from `/app/personal/wellness` to `/app/personal/measurements`; only via "เพิ่มเติม" | **GAP-2 — fixed** |
| Measurement idempotency | `createOwnPatientSelfMeasurement`: Serializable transaction, unique `(patientProfileId, submissionNonce)`, replay returns `REPLAY` with the first entry | PASS |
| Measurement unknown outcome | `patient-self-measurement-workspace.tsx` `useMutationActionState` + `UnknownOutcomeAlert` resend | PASS |
| 24-hour own-entry delete | `canDeletePatientSelfMeasurement` + `deleteOwnPatientSelfMeasurement` (re-checked in the transaction with a `createdAt` guard; `ConflictError` after 24 h); soft delete with audit | PASS |
| Label "ผู้ป่วยบันทึกเอง" | `PATIENT_SELF_MEASUREMENT_LABEL`; page description; care-team section | PASS |

### C. Medications — `OPEN_PATIENT_MEDICATIONS` → `/app/personal/medications`

| Step | Source | Result |
| --- | --- | --- |
| SELF access | `resolvePersonalMedicationOwner` | PASS |
| Add with presets | `personal-medication-controls.tsx` presets "เช้า 07:00 / กลางวัน 12:00 / เย็น 18:00 / ก่อนนอน 21:00", bounded by `MEDICATION_SCHEDULE_MAX_TIMES` | PASS |
| Stop | `MedicationStopForm`; STOPPED detail renders no form | PASS |
| Unknown outcome | network failure → "ยังยืนยันการบันทึกไม่ได้ …", `refreshRequired` blocks resubmission until reload | PASS (note Q2) |
| Reminder opt-in requires a LINE binding | `medication-line-reminder-preference-service.ts`: enable requires exactly one active binding with `lineUserId` (Serializable, row locks); `enabledForBinding` reads OFF when the binding changed or was unlinked (clear state) | PASS |
| Reminder preference readback on the Rich Menu destination | before: the page said reminders are sent "เมื่อคุณเปิดการแจ้งเตือนยา" but showed neither the current state nor where to change it (only `/app/settings`) | **GAP-3 — fixed** |

### D. Care — `OPEN_PATIENT_CARE` → `/app/personal/care`

| Step | Source | Result |
| --- | --- | --- |
| Hospital selection | same as Appointments | PASS |
| Goal Plan versions (D4) | `patient-self-care-journey-view.tsx` `GoalPlanHistoryItem`: newest first, "แผนปัจจุบัน" / "ฉบับก่อนหน้า"; detail `getOwnPatientGoalPlanDetail` read-only | PASS |
| Round history | `patient-self-program-rounds-view.tsx`, follow-up detail: read-only | PASS |
| No write path for SELF | `patient-self-care-query-service.ts` has no create/update/delete; care routes import no Server Action or `<form>` (tests assert no `<form>`/`<button>`) | PASS |
| Touch targets (D4) | before: Program / Goal Plan / follow-up history links were 26 px high | **GAP-4 — fixed** |

## 3. Confirmed issues

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| GAP-1 | Medium (UX, D3) | A signed-in account without usable Patient access (no PATIENT role, or a stale Patient Rich Menu after roles changed) opening any Patient entry was silently redirected to `/app`. | `patient-self-page-context.ts`, `patient-self-care-page-context.ts`, `wellness/page.tsx`, `medications/page.tsx` (before) |
| GAP-2 | Low (discoverability) | Self-measurements (E5) were not reachable from the Wellness destination. | `personal-wellness-workspace.tsx` topic nav (before) |
| GAP-3 | Low (UX) | Medications did not read back the LINE reminder state or link to where it is set. | `personal-medication-workspace.tsx` (before); settings form only |
| GAP-4 | Low (accessibility, D4) | Care history links were 26 px high at 360/390/430 px. | browser measurement, section 9 |

## 4. Fixes

- **GAP-1:** `src/modules/patient-self/transport/patient-access-unavailable.ts` adds the server decision `PATIENT_ACCESS_UNAVAILABLE` (no identity or reason detail). When the SELF read throws `ForbiddenError`, the five entry loaders return it instead of redirecting: `getPatientPersonalHomePageContext`, `getPatientSelfRelationshipNavigationPageContext` (optional `denied` value on the shared wrapper; detail routes keep the existing redirect), and the Wellness/Medications pages. The pages render `PatientAccessUnavailableState` (`app/app/personal/patient-access-unavailable-state.tsx`): "บัญชีนี้ยังเปิดข้อมูลผู้ป่วยไม่ได้" with guidance to sign out and sign in with the Patient account, and a link to `/app`. The copy names no other account, role or relationship. Actor-resolution errors are unchanged (`UnauthenticatedError` → login with fixed return; application access denied → existing redirect). LINE account reconciliation is not scheduled for a denied home, as before.
- **GAP-2:** the Wellness page links to "ตัวฉันในตอนนี้" (`/app/personal/measurements`) under its topic nav.
- **GAP-3:** the Medications page reads `getOwnMedicationLineReminderPreference` (existing service; `ForbiddenError` → no readback, as Settings does) and shows "การแจ้งเตือนยาทาง LINE: เปิด/ปิด", the unbound hint, and a link to `/app/settings`. No new write path; changes stay in Settings.
- **GAP-4:** the care history link style gains `inline-flex min-h-11 items-center` (44 px).
- **D5:** `src/components/app-shell/workspace-route-classification.test.ts` enumerates `app/app/*` folders and fails unless each is listed as personal, work or shared and `getWorkspaceContextForPathname` agrees (shared → `null`).

## 5. Authorization boundaries (unchanged)

Supabase session → server `ActorContext` → SELF services re-read the persisted User/Person/PATIENT role/PatientProfile; appointment interactions re-check the relationship (active, ACTIVE Hospital) inside their transactions. The denied state is rendered only from the server's `ForbiddenError`; it grants nothing and hides nothing that was previously visible. No policy, service, query or schema was modified.

## 6. Navigation before / after

| Case | Before | After |
| --- | --- | --- |
| Workforce-only account opens a Patient Rich Menu action | redirect to `/app` without explanation | the requested page title + explanatory state + "ไปหน้าหลัก" |
| No session | login → fixed return path | unchanged |
| PATIENT with no Hospital relationship (Appointments/Care) | "ยังไม่มีข้อมูลโรงพยาบาลที่เชื่อมกับข้อมูลผู้ป่วย" | unchanged |
| Wellness → self-measurements | only via "เพิ่มเติม" | direct link "ตัวฉันในตอนนี้" |
| Medications reminder state | not shown | read back, link to Settings |

## 7. Tests executed

- Red check: the three new transport tests (`patient-self-page-context.test.ts`, new `patient-self-care-page-context.test.ts`) failed against the pre-fix loaders (redirect to `/app`) and pass after the fix.
- Focused: `npx vitest run app/app/personal src/modules/patient-self src/components/app-shell` — **44 files / 380 passed**. New/changed: denied state for home/care/appointments (`personal-pages.test.ts`), Wellness and Medications (`page.test.tsx`; the Wellness denial test now expects the explanatory state instead of the redirect, still asserting no private section), reminder readback (`page.test.tsx`, `personal-medication-workspace.test.tsx`), measurements link, care link targets (`patient-self-care-views.test.tsx`), D5 guard.
- PostgreSQL integration (disposable local DB via `npm run test:db:up`, migrations applied, one file per run): `phase-c-engagement` **16/16** (reminder preference), `patient-care-end` **13/13** (Phase F), `personal-medication` **53/53**, `personal-exercise` **28/28**. No service or query was changed; these confirm the services the pages call.
- After the diff was stable, once each: `npm run typecheck` passed; `npx eslint` on all changed/new TS files passed with no findings; `npm run test` **432 files / 4503 passed**; `npm run build` passed. (A first typecheck failed only on stale `.next/dev` route types left by the deleted preview route; the generated folder was removed and typecheck passed.)
- Not re-run: the webpack `next build --webpack` gate from B2.4 (no route exports or PageProps changed).

## 8. Regression evidence

The Account LIFF, MINI App routes and transport, Rich Menu catalog and assets, and LINE provider code were not touched. Appointment, measurement, exercise, meal and medication services are unchanged.

## 9. Browser inspection (D4)

A temporary route (`app/d-preview`, deleted before commit) rendered the real page components inside the real `AppShell` with synthetic fixtures and a server-projected PATIENT (or OSM, for the denied state) navigation. In desktop Chrome each view was loaded in three same-origin iframes of 360, 390 and 430 CSS px, then measured by script and inspected by screenshot: Hospital selection (one ended relationship), appointment history, appointment detail (SCHEDULED, with reschedule form), ended-relationship detail, Wellness (with an exercise entry), self-measurements, Medications list and detail (reminder readback on/off/unbound), Care journey (current + previous Goal Plan), Goal Plan detail, denied state.

Observed: no horizontal scroll on any view; after scrolling to the end, the last control sat above the bottom tabs on every view (e.g. appointment detail last control bottom 604 px vs tabs top 636 px); all interactive elements ≥ 44 px except the care history links (GAP-4, fixed and re-measured at 44 px). Screenshots were inspected in the browser session and **not committed**. The Next dev indicator overlapped the Home tab in dev only.

## 10. Owner / product questions

1. **MINI reschedule:** the MINI App shows reschedule history read-only and offers no reschedule request, while Web does (B2.1/B2.2 pending acceptance). Accept the divergence or schedule a MINI reschedule request?
2. **Unknown outcome on Wellness/Medications vs the C2 navigation guard:** exercise/meal `UNCONFIRMED` and medication `refreshRequired` states have their own in-page recovery but do not set `data-navigation-guard="unknown-outcome"`, so leaving via a bottom tab does not ask first (the server stays consistent through nonce idempotency / reload). Should these states also register with the guard?
3. **Expired session copy:** an expired session during a mutation shows "บัญชีนี้ไม่สามารถเข้าถึง…" / "บันทึกไม่ได้ กรุณาลองใหม่อีกครั้ง" rather than "กรุณาเข้าสู่ระบบอีกครั้ง". Want a distinct sign-in prompt?
4. **Denied-state copy:** confirm the wording "บัญชีนี้ยังเปิดข้อมูลผู้ป่วยไม่ได้ …" and whether denied detail routes (deep links not from the Rich Menu) should get the same state.

## 11. Not verified

- **Physical devices / LINE in-app browser** (iOS and Android), safe-area hardware, and the on-screen keyboard covering the active input: not possible here. Steps for the owner:
  1. On an iPhone and an Android phone, open the DEMI LINE OA with a Patient test account linked; tap the Patient Rich Menu "นัดหมาย".
  2. Without a session: confirm the login page opens, sign in, and you land on `/app/personal/appointments`.
  3. Open one appointment, tap "ขอเลื่อนนัด", focus the date/reason inputs: the keyboard must not hide the focused input, and the submit button must be reachable above the bottom tabs.
  4. Repeat once on "สุขภาพ" → "ตัวฉันในตอนนี้", focus a number input and submit.
  5. Sign in with a workforce-only account, tap a Patient Rich Menu item: the "บัญชีนี้ยังเปิดข้อมูลผู้ป่วยไม่ได้" state must show.
- A real unknown-outcome response in the browser was not produced; the alerts render inline in normal flow, which the bottom-clearance measurements cover.
- Signed-in sessions against a real Supabase project were not used (synthetic fixtures by owner choice).

## 12. Files changed

- Added: `src/modules/patient-self/transport/patient-access-unavailable.ts`, `app/app/personal/patient-access-unavailable-state.tsx`, `src/modules/patient-self/transport/patient-self-care-page-context.test.ts`, `src/components/app-shell/workspace-route-classification.test.ts`, this file.
- Updated: `src/modules/patient-self/transport/patient-self-page-context.ts`, `patient-self-care-page-context.ts`; `app/app/personal/page.tsx`, `appointments/page.tsx`, `care/page.tsx`, `wellness/page.tsx`, `wellness/personal-wellness-workspace.tsx`, `medications/page.tsx`, `medications/personal-medication-workspace.tsx`, `patient-self-care-journey-view.tsx`; tests `personal-pages.test.ts`, `patient-self-page-context.test.ts`, `wellness/page.test.tsx`, `wellness/personal-wellness-workspace.test.tsx`, `medications/page.test.tsx`, `medications/personal-medication-workspace.test.tsx`, `patient-self-care-views.test.tsx`; `docs/CONTEXT.md`.

## 13. Final commit

One commit on `feat/line-qa-d-patient-workflow`: `feat(line): close Patient workflow gaps found in the D audit`. A file cannot record its own commit SHA; use `git log -1 -- docs/phases/PHASE_LINE_QA_D_PATIENT_WORKFLOW_INTEGRATION_AUDIT.md`.

## 14. Phase LINE-QA.D.1 — Unknown outcomes and expired sessions

**Decision:** Q2 yes. Q3 yes.

### Q2 — Guard active unknown outcomes

Exercise and meal feedback registers `UNCONFIRMED` with the existing `data-navigation-guard="unknown-outcome"` contract. Medication feedback registers `refreshRequired` the same way while the user is asked to load the latest list. A confirmed action removes the marker; a reload resets the action state. The C2 bottom-tab and More guard continues to use its existing confirmation dialog, so cancel leaves the route and unknown state in place. No draft tracking or domain mutation behavior was added.

### Q3 — Expired-session prompt

Patient self-service actions now distinguish `UNAUTHENTICATED` from `FORBIDDEN`. An expired session shows **“เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง”** and a sign-in link. Exercise and meals use the fixed Wellness entry, medications use the fixed Medications entry, and appointment interactions use the fixed Appointments entry. Self-measurements have no LINE quick-action entry and use plain `/login`. The return-path helper accepts only `LINE_QUICK_ACTION_RETURN_PATHS` before calling `buildLoginReturnHref`; it rejects other destinations even when they are valid for a different login flow. Existing `FORBIDDEN` copy and all authorization checks remain unchanged.

### Verification

- Focused tests: **13 files / 112 tests passed**, covering the three unknown-outcome states, cancel behavior on a bottom tab and More, action error mapping, and login-return allowlisting.
- `npm run typecheck` — **passed**.
- `npx eslint` on changed TypeScript files — **passed with no findings**.
- Full `npm run test` — **436 files / 4,524 tests passed**.
- `npm run build` — **passed**, including TypeScript and generation of 48 static pages.
