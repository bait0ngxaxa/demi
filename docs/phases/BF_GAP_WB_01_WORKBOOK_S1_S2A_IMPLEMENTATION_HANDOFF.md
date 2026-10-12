# BF-GAP-WB-01 — Workbook DoD S1 + S2a Implementation Handoff

**Program:** Business Flow Closure Program
**Date:** 2026-10-12 (Asia/Bangkok)
**Plan / decision register:** [BF-GAP-WB-00](./BF_GAP_WB_00_WORKBOOK_DOD_CLOSURE_PLAN.md) (§5.1 is the authoritative decision record)
**Disposition:** BF-GAP-WB-01 — S1 + S2a IMPLEMENTED / WORKBOOK DoD PARTIAL (85 of 108 customer columns source-ready)

## 1. Baseline

| Field | Value |
| --- | --- |
| Branch | `main` |
| Start HEAD | `8ea2f0b9f3aad9d92f5c90f170faa9ef4f22e953` (clean working tree) |
| End HEAD (implementation) | `454805e` |
| DoD | Customer workbook `docs/Dashboard App Demi.xlsx`, populated from approved operational sources (Product Owner direction 2026-10-12) |

Commits in scope:

| Commit | Kind | Summary |
| --- | --- | --- |
| `8cd4730` | docs | Workbook column crosswalk, decision sheet and slice plan (BF-GAP-WB-00) |
| `4a85b6b` | fix + test | Workbook numbers no longer date-formatted; PAM/PROMs reasons and detail labels corrected; golden column test |
| `e368ecb` | docs | Canva whiteboard visual verification (§3.1) |
| `384945b` | docs | Download access / scope decisions WB-D02/WB-D03 and slice S6 |
| `757a666` | docs | Owner decisions WB-D01..D03, R24A-D11 |
| `984b75c` | feat | Dashboard rounds 1–6 = Service 1, Goal Plan, Follow-ups 1–4 |
| `fb9c1d0` | docs | Owner decisions BR-02, BR-03, BR-08 |
| `308ffcb` | feat | Workbook rounds 1–2 from Service 1 and first Goal Plan |
| `25abfe9` | feat | Follow-up service date, achieved days, plan adjustment, obstacle; achievement in workbook and on-screen report |
| `454805e` | docs | BR-01/04/05/06/07 and S2a status |

## 2. Owner decisions applied

All were confirmed by the Product Owner in session on 2026-10-12, choosing the recommended option each time. Full wording is in BF-GAP-WB-00 §5.1.

| ID | Applied as |
| --- | --- |
| WB-D01 | Report rounds follow the workbook (1 = Service 1, 2 = Goal Plan, 3–6 = Follow-ups) |
| R24A-D11 | Dashboard “ระหว่างโปรแกรม 1–6” = service rounds; rounds 1–2 state no measurement source; Follow-up overflow on continuation rows |
| WB-D02 | OWNER + MEMBER may download, **conditional on privacy review** — not implemented |
| WB-D03 | “ทั้งหมด” = the single directly-affiliated Hospital (consistent with OR-RPT-03); area filter waits for AREA-01..05 |
| BR-01 | Service date on Follow-up (implemented) and Final Assessment (**not yet implemented**) |
| BR-02 | Round 1 “ทำ” = a Service 1 record exists in the Program |
| BR-03 | Round 2 food/exercise columns from the Program’s first Goal Plan by activity category; “การลดมื้ออาหาร” = `reduce_rice` |
| BR-04 | Achieved days 0–7 per activity; rate = Σ achieved ÷ Σ target days of the referenced Goal Plan; NOT_APPLICABLE excluded; “>70%” strictly greater on the exact ratio |
| BR-05 | Controlled outcome vocabulary — **waiting for the Owner’s list** |
| BR-06/BR-07 | Required ปรับ/ไม่ปรับ and มี/ไม่มีอุปสรรค answers on new Follow-ups; optional obstacle note never exported |
| BR-08 | OSM shown is the assignment active at report time (existing behaviour) |

## 3. Behaviour changed

### 3.1 Workbook export (`hospital-report-workbook-service.ts`)

- **Bug fix:** template cells share one style object; setting a date format in place date-formatted whole data rows (the ordinal `1` rendered as `31/12/1899`). Date and percent cells now get their own style. Files downloaded before `4a85b6b` may show this defect.
- PAM/PROMs cells show their own unavailable reasons; the detail table shows activity labels instead of codes.
- Dashboard rounds 1–6 remapped (R24A-D11); service sheet keeps the customer “ทำ/ไม่ทำ” headers.
- Round 1 (S–X) and round 2 (Y–AG) populated per BR-02/BR-03.
- Follow-up blocks: service date (legacy records fall back to recorded date), achieved days, rate as `0%` cell, ปรับ/ไม่ปรับ, มี/ไม่มี; R = count of scorable Follow-ups above 70%. Legacy records show “ไม่ได้บันทึก” / “ไม่มีข้อมูลจำนวนวันที่ทำได้ที่คำนวณได้”.
- Sheet notes explain each derived column.

### 3.2 Follow-up capture (`src/modules/followups`, follow-up form and detail pages)

- New Follow-ups require `serviceDate` (not after today in Asia/Bangkok, checked on the server), `planAdjusted`, `hasObstacle`, and `achievedDays` 0–7 for every applicable progress row. The obstacle note is accepted only when an obstacle is recorded.
- The request hash includes the new fields, so a reused nonce with a changed answer conflicts.
- Detail and history read the new fields back; legacy records state that the field did not exist yet.

### 3.3 On-screen Hospital report (`hospital-report-workspace.tsx`)

- Per Follow-up: service date, achieved/target days with rate, plan adjustment and obstacle. The >70% count shows only when all Follow-ups are on the page; otherwise it points to the Excel file.

## 4. Persistence

Migration `20261012120000_followup_workbook_facts` (additive):

- `PatientFollowup`: `serviceDate DATE`, `planAdjusted BOOLEAN`, `hasObstacle BOOLEAN`, `obstacleNote VARCHAR(1000)`; CHECK obstacle note requires `hasObstacle = TRUE`.
- `PatientFollowupActivityProgress`: `achievedDays INTEGER`; CHECKs 0..7 and NULL when `NOT_APPLICABLE`.
- Columns are nullable so existing Follow-ups remain valid history; the application requires them for new records. No backfill and no inference from legacy status values.

## 5. Security and architecture

- No authorization change. Follow-up creation keeps its existing order: authentication → schema validation → resource-level access (`followup:record`, Program lock) → business rules (service date, Goal Plan activity check) → serializable transaction → audit. Audit metadata does not include the new note text.
- Export permissions are unchanged: direct Hospital OWNER (exact Hospital) and Global ADMIN (selected Hospital). MEMBER export (WB-D02) and area scope (WB-D03) are not implemented.
- The achievement rule has a single source, `src/modules/followups/domain/followup-achievement.ts` (pure functions), used by the reporting query, the workbook, and the on-screen report. The service-date bound lives in `followup-service-date.ts`.
- Reporting stays a projection over operational records; nothing is stored for reporting only.

## 6. Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npm run lint` (whole repo) | Pass |
| Targeted unit tests (followups, reporting, goals, patient and hospital reporting pages) | 34 files / 273 tests pass |
| Golden workbook test | Pins all 43 + 65 customer columns, template header rows 4–8, and coverage SOURCE_READY 85 · DECISION_OPEN 2 · SOURCE_MISSING 21 |
| Integration (PostgreSQL, `npm run test:integration:focused`) | followups 6/6, patient-program 27/27, program-reporting 2/2, hospital-reporting 8/8; includes a new test proving the CHECK constraints |
| Full unit suite `npm run test` | 2548 / 2549 pass |

The one full-suite failure is pre-existing and unrelated: `src/components/app-shell/application-workspace.test.ts` (“keeps Platform Admin on governance entry points”) expects two admin entry points, while navigation gained `/app/admin/reporting` in the 2026-10-11 reporting commits (`a3e7c7d`, `9068487`, `bebf268`). No file under `src/components` changed in this work. It reproduces in isolation and still needs its own fix.

Not run: production build, full integration suite, browser/manual UAT of the new form. The Thai/encoding scan found no replacement characters; files are LF in the git index.

## 7. Remaining work toward the DoD

| Item | Blocked on | Columns |
| --- | --- | --- |
| Outcome “ผลลัพธ์ที่ได้” | Owner vocabulary list (BR-05) | AK, AS, BA, BI |
| Final Assessment service date | None — next engineering slice (BR-01 After) | After dates / note |
| Link a new Goal Plan to the Follow-up that chose “ปรับแผน” | None — schema link not yet designed | Traceability only |
| HbA1c, BMI, CVD, illness duration, weekly exercise, DM/Pre-DM, PAM/PROMs, confidence ruler | Clinical authority (CL-01..07) | E, H, I, L, M, N, Q, AJ, AK, AN, K, L and header counts |
| Rounds 1–2 DTX/BW | Decide whether Service 1 / Goal Plan capture measurements (R24A-D11 follow-up) | Q–V |
| MEMBER download, area filter | Privacy review (WB-D02); AREA-01..05 (WB-D03) | Access/scope |
| Pre-existing app-shell test failure | Separate fix | — |
| Manual UAT: record a Follow-up with the new form, export, compare | Owner/UAT | All |

## 8. Final disposition

**BF-GAP-WB-01 — S1 + S2a IMPLEMENTED.** The workbook DoD is not yet complete. Next engineering slices that need no new decision are the Final Assessment service date and the Goal Plan link for plan adjustments; the outcome column waits for the Owner’s vocabulary, and the clinical columns wait for clinical sign-off.
