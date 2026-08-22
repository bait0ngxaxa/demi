# Phase 15E.2 — Program Factual Report UI Integration

## 1. Scope

Phase 15E.2 adds a read-only factual report view for one exact Patient
Program. It integrates the accepted Phase 15E.1 `ProgramReportingProjection`
into the existing nested Program journey.

This is an application report view. It is not the customer Hospital dashboard,
customer workbook reproduction, clinical outcome screen, comparison view, or
export workflow.

## 2. Starting branch and HEAD

Implementation started from the requested clean baseline:

```text
branch: main
HEAD:   928932287ae290c9b0c8fd89b20cfbc1d176d0b0
commit: feat(phase-15e1): add exact-Program reporting projection foundation
```

The working tree was clean before implementation. No unrelated work was
discarded or overwritten, and existing Thai text was kept as UTF-8.

## 3. Route and UI location

The report is available at:

```text
/app/patients/[relationshipId]/programs/[programId]/report
```

The existing Program detail page now exposes `ดูรายงานข้อมูลโปรแกรม`. The
entry point is available for both `ACTIVE` and `COMPLETED` Programs and keeps
both route identifiers as the exact ownership boundary. No global
`/app/reports/[programId]` route and no Hospital-wide report route were added.

The route contains:

```text
report/page.tsx
report/program-report-view.tsx
report/loading.tsx
```

## 4. Authorization behavior

The route resolves the authenticated server actor with
`getProtectedApplicationActor()` and calls the Phase 15E.1 reporting boundary.
It does not implement client-side authorization or trust a Hospital ID,
relationship ID, Program status, or report value supplied by a browser.

The projection continues to enforce the dedicated capability:

```text
report:program:read
```

The accepted narrow scope remains:

- active direct HOSPITAL OWNER/MEMBER access to the exact active Hospital;
- active OSM-Hospital relationship plus the exact active Patient assignment.

ADMIN-only, PATIENT, unrelated Hospital, unassigned OSM, ended assignment,
inactive membership, inactive Hospital, and other fail-closed cases do not
receive report content. Unauthenticated requests use `/login`; inaccessible
or forbidden requests use the existing `notFound()` / protected application
fallback behavior.

## 5. Server-side data-loading path

The route is a Next.js Server Component. Its data path is:

```text
Nested Program report route
    ↓
getProtectedApplicationActor()
    ↓
getProgramReportingProjection(
  actor,
  relationshipId,
  programId,
  { goalPlans: { cursor }, followups: { cursor } },
)
    ↓
ProgramReportView
```

The UI does not call Prisma, Baseline, Follow-up, Goal Plan, or Final services
and does not reconstruct a report from relationship-wide reads. Template labels
are resolved only from the existing immutable Goal template registry when a
historical key/version is available; otherwise the stored code remains visible.

## 6. Report UI structure

The page uses existing `PageHeader`, `Panel`, `Alert`, `StatusBadge`, `Link`,
semantic `section`/heading structure, definition lists, and responsive lists:

1. Patient and Hospital report header
2. วงจรโปรแกรม
3. ข้อมูล Baseline ที่เชื่อมกับโปรแกรม
4. บริการครั้งที่ 1 (Service 1)
5. แผนเป้าหมาย (Goal Plan)
6. ประวัติการติดตามผล
7. ข้อมูล Final Assessment

The layout uses separate cards and bounded grids rather than reproducing the
wide workbook shape or six fixed Follow-up columns.

## 7. Header and identity contract

The header renders only factual context from the projection:

- `patient.displayName`;
- `hospital.name`;
- Program status;
- Program lifecycle dates.

Technical route identifiers remain in links and React keys only. The report UI
does not display `hospitalNumber`, HN, a customer-facing Patient ID,
relationship UUID, or Program UUID as a report field. No substitute ID was
invented.

## 8. RPT-03 / HN omission

RPT-03 remains gated. The report projection and rendered report view contain no
HN or customer-facing Patient identifier. The existing Program detail page's
pre-existing HN display was not widened into the report view.

## 9. Lifecycle presentation

The report uses the existing Thai Program wording:

```text
สถานะโปรแกรม
เริ่มโปรแกรมเมื่อ
จบโปรแกรมเมื่อ
```

`ACTIVE` is shown as `กำลังดำเนินการ`, and `COMPLETED` as `เสร็จสิ้นแล้ว`.
`startedAt` and `completedAt` are rendered as Program lifecycle timestamps.
An active Program without `completedAt` is shown as `ยังไม่จบโปรแกรม`.
These values are not labelled as measurement or observation dates.

## 10. Linked Baseline presentation

The section is titled `ข้อมูล Baseline ที่เชื่อมกับโปรแกรม` and reads only the
Baseline reached through the exact Program `initialBaselineId` link from the
projection. There is no latest-Baseline or relationship-wide fallback.

When absent, the UI says:

```text
โปรแกรมนี้ไม่มีข้อมูล Baseline ที่เชื่อมไว้
```

When present, it shows the date-only `recordedOn`, `recordedBy.displayName`,
and raw weight, waist, systolic BP, diastolic BP, and DTX values. Existing
prototype labels (`kg`, `cm`, `mmHg`, `DTX / mg%`) are retained with a note that
they are current prototype labels. `ReportFact.NOT_RECORDED` renders as
`ไม่มีข้อมูล`; it is never converted to zero.

## 11. Service 1 presentation

The report shows factual presence for:

- ตารางกิจวัตร (Routine);
- กราฟวัดลอยจม (Floating Chart);
- การ์ดความฝัน (Dream Card);
- ไม้บรรทัดวัดใจ (Confidence).

Each activity displays `มีข้อมูล` or `ยังไม่มีข้อมูล`. A recorded activity
shows `recordedAt` as `บันทึกในระบบเมื่อ` and the recorder display name. Safe
evidence metadata may show media type, byte size, and upload time. The UI does
not render artifact IDs, storage object keys, signed/private URLs, or download
controls. Presence is not translated into pass, success, completion, or
clinical achievement.

## 12. Goal Plan presentation and pagination

Goal Plans are rendered only from `report.goalPlans`. Each displayed round may
show the round number, recording time, recorder, primary goal code plus a safe
template label, notes, template key/version, activity codes/labels, target
days, and raw target value/unit facts.

No achievement, completion percentage, success, failure, target classification,
or other derived value is calculated.

The route passes the opaque `goalCursor` directly to the projection. The UI
shows a bounded page summary and `ดูแผนรายการถัดไป` when `hasMore` is true. A
continuation link preserves the exact relationship/Program route and retains
the current Follow-up cursor.

## 13. Follow-up presentation and pagination

Follow-ups are rendered as normalized `0..N` stacked cards. Each round shows
the stored round number, `recordedAt` labelled `บันทึกในระบบเมื่อ`, recorder,
raw measurements, activity codes, stored progress statuses, and notes.

Stored statuses use neutral wording:

```text
DONE           → ทำได้
PARTIAL        → ทำได้บางส่วน
NOT_DONE       → ยังไม่ได้ทำ
NOT_APPLICABLE → ไม่เกี่ยวข้อง
```

Notes remain notes. The UI does not infer obstacles, outcomes, plan changes,
or clinical meaning from a note or status.

The route passes opaque `followupCursor` values directly to the projection.
The UI does not decode cursors or implement infinite scrolling. It shows the
bounded page summary and `ดูการติดตามผลรายการถัดไป` when more records exist.
The continuation link preserves the exact relationship/Program route and the
current Goal Plan cursor, so records beyond six remain reachable.

## 14. Final presentation

The section title is `ข้อมูล Final Assessment`. A present Final shows the raw
weight, waist, systolic BP, diastolic BP, and blood sugar facts, recorder, and
`recordedAt` labelled `บันทึกในระบบเมื่อ`.

For an absent Final, the UI distinguishes lifecycle context without implying
failure:

```text
ACTIVE:
ยังไม่มีข้อมูล Final Assessment ที่บันทึกในโปรแกรมนี้

COMPLETED:
โปรแกรมนี้ไม่มีข้อมูล Final Assessment ที่บันทึกไว้
```

There are no create, edit, delete, correction, finalize, approve, or export
controls on the report page.

## 15. Missing-value presentation

Source-level missing states remain distinct from field-level missing facts:

- missing linked Baseline is its own neutral section state;
- missing Service 1 activity is shown independently;
- empty Goal Plan history is shown independently;
- empty Follow-up history is shown independently;
- missing Final is lifecycle-aware but neutral;
- nullable measurements and notes render `ไม่มีข้อมูล`.

No missing value becomes `0`, false, failure, success, normal, abnormal, or
not achieved.

## 16. Timestamp wording

Timestamp labels preserve source semantics:

- Program `startedAt` / `completedAt` → `เริ่มโปรแกรมเมื่อ` / `จบโปรแกรมเมื่อ`;
- Baseline `recordedOn` → date-only `วันที่บันทึกข้อมูล`;
- Service 1, Follow-up, and Final `recordedAt` → `บันทึกในระบบเมื่อ`;
- no recording timestamp is labelled as `วัดเมื่อ` or as a clinical
  observation time.

The existing Asia/Bangkok formatting convention is reused locally, matching
the surrounding Program UI.

## 17. Mobile and responsive behavior

The report uses the existing responsive Tailwind tokens and component language:

- sections stack at narrow widths;
- related facts wrap in responsive definition-list grids;
- long Thai notes and codes use `break-words` and `whitespace-pre-wrap`;
- Service 1, Goal Plan, and Follow-up content uses stacked cards/lists;
- pagination links have at least the existing compact touch target and become
  full-width when shown in a narrow continuation row;
- no report table requires critical horizontal scrolling;
- text labels accompany status styling, so color is not the only state signal.

No client state, `useEffect`, browser fetch, or client-side report loading was
introduced.

## 18. Explicit non-clinical semantics

The page does not add or render:

- clinical Before/During/After stages;
- Before/After comparison, delta, trend, arrows, or improvement language;
- BMI, Height, HbA1c, CVD risk, DM/Pre-DM classification, thresholds, or risk
  levels;
- unit conversion or normalization;
- goal achievement percentage, success/failure, or `>70%` counts;
- clinical outcome interpretation.

Raw values are presented as recorded facts from separate source sections.

## 19. Explicit exclusions

This phase does not implement Hospital-wide dashboards, cohorts, cross-patient
aggregation, workbook reproduction, Excel/CSV/PDF, downloads, export
authorization, report audit logging, report persistence, new Prisma fields,
migrations, clinical calculations, or a generic analytics framework.

## 20. No schema or migration changes

`prisma/schema.prisma` and `prisma/migrations/**` are unchanged. No report
table, snapshot, cache, materialized view, clinical field, `observedAt`, or HN
display field was added.

## 21. Verification

Verification completed during implementation:

```text
npx tsc --noEmit              PASS
npm run lint                  PASS
npm test -- src/modules/reporting
  PASS — 4 files, 30 tests
npm test -- src/modules/reporting src/modules/patient-program src/modules/patient-final-assessment
  PASS — 19 files, 130 tests
npm test                      PASS — 118 files, 767 tests
npm run test:integration      PASS — 19 files, 158 tests
npm run build                 PASS — report route compiled as a dynamic App route
git diff --check              PASS (Git emitted only the repository's LF/CRLF warning)
```

The focused UI/route tests cover exact nested route arguments, authorized
Hospital/assigned OSM route invocation, fail-closed not-found/forbidden and
unauthenticated handling, HN omission, identity/lifecycle wording, Baseline
missing/null values, Service 1 safe metadata, Goal Plan pagination, Follow-up
round 7 pagination/statuses, Final missing/present states, prohibited clinical
fields, read-only markup, and responsive semantic structure.

The Impeccable mechanical detector was run once over the changed UI targets
and returned no findings. A file-based finish review used the existing
PRODUCT.md/DESIGN.md system and the craft-floor rules; its disposition was
`ship`. No approved visual comp or authenticated browser session was available
for screenshot comparison.

Manual browser verification was not performed in this implementation session;
the route was validated by server-component rendering tests and static markup
inspection. Desktop/mobile visual verification remains a handoff item if a
running authenticated browser environment is available.

## 22. Phase 15E.3 handoff

Do not implement the Hospital dashboard automatically from this phase. The
next candidate is:

```text
Phase 15E.3 — Hospital Reporting / Dashboard Requirement Gate
```

Before any Hospital-wide or workbook-shaped implementation, re-audit at least:

```text
RPT-01 report scope
RPT-03 patient identifier
RPT-06 DM/Pre-DM authority
RPT-07/08/09 clinical stage semantics
RPT-10 HbA1c
RPT-11 Height
RPT-12 BMI
RPT-13 CVD
RPT-17 achievement
RPT-18 >70% count
RPT-22 missing-value presentation
RPT-23 workbook shape
RPT-24 Excel requirement
RPT-26 report/export audit
RPT-28 cohort filters/aggregates
```

If those decisions remain open, the next phase should stay a requirements
gate or reporting-journey re-audit. A future factual Hospital subset may be
possible only after its actor scope, source ownership, missing-value contract,
and audit/export boundaries are explicitly accepted; this phase does not
recommend or implement it.
