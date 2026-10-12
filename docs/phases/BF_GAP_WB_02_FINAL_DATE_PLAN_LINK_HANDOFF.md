# BF-GAP-WB-02 — Final Assessment Date, Adjusted Plan Link and App-shell Test Handoff

**Program:** Business Flow Closure Program
**Date:** 2026-10-12 (Asia/Bangkok)
**Plan / decision register:** [BF-GAP-WB-00](./BF_GAP_WB_00_WORKBOOK_DOD_CLOSURE_PLAN.md) (§5.1 decisions, §5.2 pending register)
**Previous handoff:** [BF-GAP-WB-01](./BF_GAP_WB_01_WORKBOOK_S1_S2A_IMPLEMENTATION_HANDOFF.md)
**Disposition:** BF-GAP-WB-02 — ENGINEERING ITEMS WITHOUT OPEN DECISIONS IMPLEMENTED / WORKBOOK DoD STILL WAITING ON §5.2

## 1. Scope

After BF-GAP-WB-01, the Product Owner directed engineering to finish work that needs no further decision and to record what is waiting. Items needing an Owner, clinical or privacy answer are listed in BF-GAP-WB-00 §5.2 (P-01..P-12) and were not implemented.

| Commit | Summary |
| --- | --- |
| `f138ff0` | Final Assessment service date (BR-01, After); service-date rule moved to `src/shared/time/service-date.ts` |
| `482b293` | Adjusted Goal Plan linked to the Program Follow-up that chose “ปรับแผน” (BR-06) |
| `978f8f5` | Stale app-shell test updated for the Platform Admin reporting entry point |

Start HEAD `9cb2bd8`, end HEAD `978f8f5` (implementation), branch `main`.

## 2. Behaviour changed

### 2.1 Final Assessment service date (`f138ff0`)

- New Final Assessments require `serviceDate` (date of the assessment, Asia/Bangkok, not in the future, checked on the server before the Program is locked). The form defaults to today and allows earlier dates.
- The Program page, its read-only Final view and the on-screen Hospital report show the assessment date; assessments recorded earlier say the field did not exist yet.
- The workbook has no Final date column (After dates in the workbook are Program lifecycle dates), so the export is unchanged.
- Migration `20261012130000_final_assessment_service_date`: nullable `PatientFinalAssessment.serviceDate DATE`, required by the application for new records.
- `src/shared/time/service-date.ts` now owns the date-only schema, the Bangkok calendar date and the future-date bound for both Follow-up and Final Assessment. The temporary `followups/domain/followup-service-date.ts` was removed.

### 2.2 Adjusted Goal Plan link (`482b293`)

- `PatientGoalPlan.sourceFollowupId` records the Follow-up whose “ปรับแผน” answer produced the plan.
- Server rules (`goal-service.ts`, after the Program lock): the Follow-up must be in the same Program, must have `planAdjusted = true`, and must not already have an adjusted plan; otherwise NotFound / Validation / Conflict. Only Program Goal Plans may carry the link (the relationship-scoped schema rejects the field).
- PostgreSQL backstops (migration `20261012140000_goal_plan_source_followup`): unique `sourceFollowupId`; composite FK `(sourceFollowupId, patientProgramId, patientHospitalRelationshipId)` → `PatientFollowup(id, patientProgramId, patientHospitalRelationshipId)`; CHECK that a linked plan is Program-scoped.
- UI: after saving a Program Follow-up with “ปรับแผน”, the user is taken to the Program Goal Plan form with the link pre-filled. The Follow-up detail shows the adjusted plan, or offers to create it when the Program is active and the actor can manage it. Pre-Program (relationship) Follow-ups keep the earlier guidance text and have no link.
- Request identity: a reused Goal Plan nonce with a different `sourceFollowupId` conflicts. Audit metadata includes `sourceFollowupId`.
- Integration-test cleanups that delete Follow-ups now clear the link first, because Goal Plans and Follow-ups reference each other.

### 2.3 App-shell test (`978f8f5`)

- `application-workspace.test.ts` expected two ADMIN governance actions. Navigation has listed `/app/admin/reporting` for ADMIN since the Global ADMIN reporting gates were removed (`bebf268`), and Global ADMIN selected-Hospital reporting (RPT-33) is verified implemented. The workspace projection derives its actions from navigation, so only the stale expectation changed. No runtime code changed.

## 3. Security and architecture

- No authorization change. Both new rules sit inside the existing mutation order: authentication → schema validation → resource access → Program lock → business rules → serializable transaction → audit.
- The link is enforced in the service and backstopped in PostgreSQL; it never trusts a browser-supplied Program or relationship.
- Reporting remains a projection; no report-only data was added.

## 4. Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass |
| Full unit suite `npm run test` | 302 files / 2553 tests pass (the earlier app-shell failure is fixed) |
| `prisma validate`, `prisma generate` | Pass |
| `prisma migrate diff` (migrated test DB → schema) | No drift from these migrations; output shows only pre-existing constraint-name truncation renames and an unmodelled `CaregiverRelationship_source_pair_fkey` |
| Focused integration (PostgreSQL) | patient-program 28/28 (incl. new adjusted-plan link and DB backstop test, Final service date persistence), program-reporting 2/2, followups 6/6 |
| Full integration `npm run test:integration` | First run 666/681 (see §5); after the seed fix 40 files / 681 tests pass |

Not run: production build, browser/manual UAT.

## 5. Integration failures found during verification — fixed

The first full integration run had 15 failures in `hospital-onboarding` (12), `hospital-contact`, `hospital-content` and `hospital-knowledge-contact-reaudit` (1 each), all right after `runHospitalMasterSeed()` with “No record was found” for a seeded Hospital.

- **Root cause:** `d417970` (hospital hierarchy integration, 2026-10-11) made `scripts/seed-hospital-master.mjs` read-only by default; `--apply` is required to write ([handoff](./PHASE_HOSPITAL_HIERARCHY_INTEGRATION_HANDOFF.md) §11 confirms this is intended). The four test helpers still ran the script with no arguments, so the seed did a dry-run, exited 0 and created no Hospitals. The master data itself is unchanged (78 records, including `KANG`).
- **Fix (`tests/integration` only):** the helpers now run the seed with `--apply --integration`, the mode designed for the local test database (it verifies `DEMI_TEST_DATABASE_URL` and refuses non-local or non-test targets). The seed script and product code are unchanged.
- **Result:** the four files pass in isolation (12 + 36 + 18 + 7) and the full integration suite passes 681/681.

These failures pre-date this work: they come from the seed-default change in `d417970` and do not depend on any file changed here.

## 6. Waiting items

See BF-GAP-WB-00 §5.2 (P-01..P-12). In summary: outcome vocabulary, rounds 1–2 measurements, all clinical columns (CL-01..07), MEMBER download privacy review, responsibility areas, and manual UAT.

## 7. Final disposition

**BF-GAP-WB-02 — IMPLEMENTED.** All engineering work that needed no further decision is complete. Workbook coverage is unchanged at SOURCE_READY 85 · DECISION_OPEN 2 · SOURCE_MISSING 21 (the Final date and plan link improve traceability, not workbook columns). The remaining DoD work waits on §5.2.
