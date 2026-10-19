# Phase LINE-QA.C1 — OSM Fieldwork Workflow Integration Audit

**Date:** 2026-10-19
**Starting HEAD:** `b2e1823054486e929b0fb62d7f72f84038e87e8a` (matches the required baseline; `main` had not moved)
**Final commit:** the commit that adds this file on `main` (see section 13)
**Status:** Audit complete. Two verified gaps fixed with focused tests. No LINE provider call, LINE Console or Rich Menu change, environment change, migration, production database access or deployment was made.

Scope: the four OSM Rich Menu actions that open ordinary DEMI Web routes. LINE stays a navigation entry point. The Account LIFF and the Patient Appointment MINI App were not changed. No flag, channel, token, cookie, table, manifest or provider credential was added.

## 1. Shared entry path (all four actions)

| Step | Source | Behavior | Result |
| --- | --- | --- | --- |
| Rich Menu intent → URL | `src/modules/line/domain/line-navigation-intents.ts` `LINE_WEB_NAVIGATION_PATHS`; `src/modules/line/services/line-deep-link-builder.ts` `buildLineIntentUrl` | Fixed path joined to the trusted `DEMI_LINE_PUBLIC_ORIGIN`. No Patient, resource or role ID goes into a LINE URL. | PASS |
| Proxy allowlist | `proxy.ts`; `src/lib/auth/supabase-proxy.ts` `createNextResponse` | `getLineQuickActionReturnPathFromUrl` matches `pathname+search` exactly against the finite `LINE_QUICK_ACTION_RETURN_PATHS`. The proxy deletes any client-sent `x-demi-line-quick-action-return-to` and sets it only on an exact match. | PASS |
| Login required | `app/app/layout.tsx` `resolveProtectedActor`; each page's `resolveActor` | No session leads to `buildLoginReturnHref(exact path)`. Any other path leads to plain `/login`. | PASS |
| returnTo validation | `src/modules/auth/schemas/login-schema.ts` `loginReturnToSchema`; `app/login/page.tsx`; `loginAction` | Exact-string allowlist: `/line/account`, the MINI gateway, the quick-action paths and the family-invitation fragment. Encoded, foreign, extra-parameter and partial-path values are rejected and fall back to `/app`. The redirect target is the parsed value, never raw input. | PASS |
| Arrival re-authorization | `getProtectedApplicationActor` plus each domain service | The actor is resolved on the server for every request. A successful login return grants nothing by itself. | PASS |
| Family / LINE Account / MINI returns | same schema | Unchanged. No LIFF check or MINI cookie is used on OSM routes. | PASS |

## 2. Workflow traces

### A. Assigned Patients — `OPEN_OSM_ASSIGNED_PATIENTS` → `/app/patients/assigned`

| Step | Source | Result |
| --- | --- | --- |
| Policy | `patient-directory-policy.ts` `assertOsmAssignedPatientReadPolicy`: OSM role plus an ACTIVE OSM–Hospital relationship at an ACTIVE Hospital | PASS |
| Scope filter | `patient-directory-query-service.ts` `buildOsmAssignedPatientRelationshipWhere`: active relationship, PATIENT role, Hospital ACTIVE with this user's ACTIVE OSM relationship, an assignment with `endedAt: null` for this user. `count` and `findMany` share one `where`. | PASS |
| Search / filter / paging | Partial name terms, exact HN, classification. `directoryUrl` and the hidden `task` input keep the mode. The page clamps to `totalPages`. | PASS |
| Identification | Each row shows the name, `โรงพยาบาล:` and `HN ของโรงพยาบาลนี้`, so a person in two Hospitals appears as two distinct rows. | PASS |
| Empty vs unavailable | Separate copy for no assignments, no filtered match and invalid search. Infrastructure failure throws to the error boundary. | PASS |
| Denied | ForbiddenError (not OSM, or no active scope) redirects to `/app`. | PASS (UX note in section 11) |
| Revoked assignment | Not listed; the destination services re-check on every request. | PASS |

### B. Screening — `START_OSM_SCREENING` → `?task=screening` → `/screenings/new`

| Step | Source | Result |
| --- | --- | --- |
| Mode | `parseTaskMode` accepts only `screening` or `followup`. The mode changes copy and row target only, never authority. | PASS |
| Form initialization | `screenings/new/page.tsx` → `getScreeningPatientForSubmission` → `resolveScreeningAccessContext`: active relationship, ACTIVE Hospital, PATIENT role, actor re-read from DB, latest active assignment equals the actor, `assertScreeningPolicy` | PASS |
| Submit | `submitScreeningAction` → `submitScreening`: Serializable transaction (re-runs access inside it), nonce lookup returns the same assessment for an identical retry and CONFLICT for a reused nonce, Program link locked, audit `screening.submitted` | PASS |
| Unknown outcome | `useMutationActionState` + `UnknownOutcomeAlert` resend with the same nonce; no success shown until confirmed | PASS |
| Success destination | Screening detail, or Program round 1 when `programId` is present. Unchanged. | PASS |
| Continuation | Before: the detail page linked only to history and the Patient. Task mode was lost. | **GAP-2 — fixed** |

### C. Follow-up — `START_OSM_FOLLOWUP` → `?task=followup` → follow-up form

| Step | Source | Result |
| --- | --- | --- |
| Row target | Before: always `/app/patients/{id}/followups/new` (relationship scope). The existing rule (`followup-history-view.tsx` `createHref`, `appointment-followup-context.ts`, copy "การติดตามผลรอบใหม่ให้บันทึกจากโปรแกรมปัจจุบัน") records a new round inside the ACTIVE Program. | **GAP-1 — fixed** |
| Access | `resolveFollowupAccessContext` (same pattern as screening). The Program route also uses `resolvePatientProgramByIdAccessContext` with `program:manage`, which the exact-assigned OSM holds. | PASS |
| Appointment / Goal Plan | `assertCompletedAppointment` (same relationship, COMPLETED); `assertGoalActivityProgress` uses authorized Goal Plan context; activity codes are limited to the plan | PASS |
| Submit | Serializable transaction, request-hash nonce identity, round number computed in the transaction, `lockActivePatientProgram`, audit | PASS |
| Success destination | Relationship detail; Program detail; or BR-06 `goals/new?sourceFollowupId=` when the Program follow-up chose "ปรับแผน". Unchanged. | PASS |
| Continuation | Same gap as screening | **GAP-2 — fixed** |

### D. Patient Provisioning — `OPEN_PATIENT_PROVISIONING` → `/app/patients/provision`

| Step | Source | Result |
| --- | --- | --- |
| Scopes | `listPatientProvisioningScopes` re-reads the user from the DB. HOSPITAL gives direct OWNER/MEMBER ACTIVE scopes (bulk import allowed). OSM gives ACTIVE OSM relationships at ACTIVE Hospitals (single only). | PASS |
| No scope | An OSM/HOSPITAL actor without scope sees "ไม่พบโรงพยาบาลที่เปิดให้ดำเนินการ". Other roles go to `/app`. | PASS |
| Hospital selection | `?hospitalId` is honored only when it is in the server scope list; otherwise the first scope is used | PASS |
| Mutation target | `provisionPatientInTransaction` → `assertActorPolicy` + `assertPatientProvisioningActorInDatabase` re-checks the submitted `targetHospitalId` against the DB. Bulk preview and confirm use `validateRosterImportTarget` and require direct scope. | PASS |
| Identity / duplicates / import | Server-owned; not modified | PASS (unchanged) |
| Success | Shows the real outcome (`ALREADY_PROVISIONED` / created / linked ACTIVE). `projectPatientProvisionContinuation` gives OSM no detail or activation links and states that. | PASS |

## 3. Confirmed issues

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| GAP-1 | Medium (data placement) | In follow-up task mode, a Patient with an ACTIVE Program got a relationship-scope follow-up. The round was missing from the Program ledger and the BR-06 plan-adjustment continuation never ran. The domain accepts relationship follow-ups, so this succeeded silently. | `assigned-patient-directory-view.tsx` (before) vs `followup-history-view.tsx` `createHref`; `followup-form.tsx` success effect only continues to `goals/new` with a `programId` |
| GAP-2 | Low (UX) | After a screening or follow-up was saved, no path returned to the task-mode list. The breadcrumb reached `/app/patients/assigned` without the mode. | screening detail and follow-up detail action rows |

## 4. Fixes

- **GAP-1:** `findAssignedPatientDirectory` now selects the relationship's ACTIVE Program id (`assignedPatientDirectorySelect`; at most one per relationship under the existing unique index). Items are `PatientAssignedDirectoryItem` with `activeProgramId`. In follow-up mode the row opens `/app/patients/{id}/programs/{programId}/followups/new` when a Program is active, which is the same rule as the history CTA. The Program route re-authorizes. Screening rows and the hospital directory are unchanged.
- **GAP-2:** The screening detail page, the relationship follow-up detail page and the Program follow-up detail page show "เลือกผู้ป่วยรายถัดไปเพื่อคัดกรอง" or "เลือกผู้ป่วยรายถัดไปเพื่อบันทึกติดตาม", linking to the fixed `LINE_WEB_NAVIGATION_PATHS.START_OSM_SCREENING` / `START_OSM_FOLLOWUP`. They appear only when `decideOsmAssignedPatientReadPolicy` allows the current actor. The link takes no client-supplied return URL, and the canonical success destinations are unchanged. The action rows gained `sm:flex-wrap` for the third button.

## 5. Authorization boundaries (unchanged)

Supabase session → server `ActorContext` → each service re-reads the actor and the target from the DB (inside the Serializable transaction for mutations) → policy checks role, membership/OSM relationship, Hospital status and exact active assignment. The new `activeProgramId` and continuation links are navigation only and grant no access. A stale Rich Menu, task mode or role selection is never authority.

## 6. Navigation before / after

| Case | Before | After |
| --- | --- | --- |
| Follow-up mode, Patient in an ACTIVE Program | `/followups/new` (outside the Program) | `/programs/{id}/followups/new` → Program detail, or BR-06 Goal Plan |
| Follow-up mode, no ACTIVE Program | `/followups/new` | unchanged |
| After saving a screening (no Program) | detail → history or Patient only | plus "เลือกผู้ป่วยรายถัดไปเพื่อคัดกรอง" → `?task=screening` |
| After saving a follow-up | detail → history or Patient only | plus "เลือกผู้ป่วยรายถัดไปเพื่อบันทึกติดตาม" → `?task=followup` |

## 7. Tests executed

- `npx vitest run app/app/patients/assigned "app/app/patients/[relationshipId]/screenings" "app/app/patients/[relationshipId]/followups" src/modules/patient-directory`: **9 files / 82 passed**.
  - New: `screenings/[screeningId]/page.test.tsx` and `followups/[followupId]/page.test.tsx` (link shown for an active OSM scope; hidden for HOSPITAL-only, suspended-Hospital and ended OSM scope).
  - New: directory view Program link test (the screening row is not affected).
  - New: service select/projection tests.
- `npm run test:integration:focused` on disposable local PostgreSQL (`127.0.0.1:55432`), one file per run:
  - `patient-osm-assignment` **5/5**: now also asserts `activeProgramId` is null, and is the ACTIVE id rather than a COMPLETED Program's.
  - `followups` **6/6**, `screening` **1/1**, `patient-provisioning` **15/15**, `osm-relationship-lifecycle` **12/12**, `patient-program` **28/28**.
  - `line-account-linking` **27/27**: B2.4 transfer and account-switch regression.
- `npm run typecheck`: passed. `npx eslint` on all changed and new files: passed.
- `npm run test` (full unit suite, once, after the diff was stable): **428 files / 4440 passed**. This covers login return, LINE navigation, Rich Menu catalog (18 variants), Account LIFF switch/Unlink/Recovery and MINI workflow tests.
- `npm run build` (Next default bundler): passed.

## 8. Regression evidence

The LINE Account switch, explicit Unlink transfer, Recovery after LIFF reopen, Full Disconnection and MINI Appointment verification code paths were not touched. Their unit tests passed in the full suite and `line-account-linking` passed on PostgreSQL. No Rich Menu catalog, layout or asset changed.

## 9. Not verified

- Real-device LINE app behavior and production data (out of scope).
- The webpack `next build --webpack` gate from B2.4 was not re-run; no PageProps or route exports changed.
- Visual check at 360/390/430 px was done by reading the markup only (stacked `flex-col`, `min-h-11` targets, no fixed widths). No browser screenshot was taken.

## 10. Owner / product questions

1. **Screening task with an ACTIVE Program:** the screening row opens a relationship screening, which matches the existing "เริ่มแบบประเมินใหม่" on screening history. A Program's round-1 screening is started from the Program round (`?programId=`). Should LINE screening mode send Patients whose ACTIVE Program has no round-1 screening to that round? Left unchanged pending a decision.
2. **Provisioning by OSM:** current policy lets any OSM with an ACTIVE OSM–Hospital relationship provision single Patients there; bulk import is direct-Hospital only. Confirm this is intended for all OSM users.

## 11. Deferred to C2 (UX)

- Denied or no-scope arrivals on the assigned directory and screening/follow-up forms redirect silently to `/app`. An explanatory state would be clearer.
- Opening a deep link without a session, other than the four exact quick-action paths, returns to `/app` after login, not to the link (by design of the finite allowlist).
- Patient detail breadcrumbs return to the assigned list without the task mode.
- Browser screenshot review of the directory and forms at 360/390/430 px.

## 12. Files changed

- `src/modules/patient-directory/services/patient-directory-query-service.ts`
- `app/app/patients/assigned/assigned-patient-directory-view.tsx`
- `app/app/patients/[relationshipId]/screenings/[screeningId]/page.tsx`
- `app/app/patients/[relationshipId]/followups/[followupId]/followup-detail-view.tsx`, `page.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/followups/[followupId]/page.tsx`
- Tests: `patient-assigned-directory-query-service.test.ts`, `assigned-patient-directory-view.test.tsx`, new `screenings/[screeningId]/page.test.tsx`, new `followups/[followupId]/page.test.tsx`, `tests/integration/patient-osm-assignment.integration.test.ts`
- Docs: this file, `docs/CONTEXT.md` addendum

## 13. Final commit

Committed and pushed to `main` on owner approval as the single C1 commit that adds this file (`git log -1 -- docs/phases/PHASE_LINE_QA_C1_OSM_WORKFLOW_INTEGRATION_AUDIT.md`). A file cannot record its own commit SHA.
