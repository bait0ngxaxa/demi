# RPT-DASH-01 — Hospital Service Dashboard (bounded UI and factual aggregate enhancement)

- **Status:** `VERIFIED_IMPLEMENTED` for the scope below (automated unit/component evidence; PostgreSQL integration and manual browser/device checks not run in this delivery — see §7)
- **Date:** 2026-10-27
- **Authority:** Product Owner execution brief of 2026-10-27 authorizing a bounded dashboard UI and factual aggregate enhancement of `/app/hospitals/reporting`. It is **not** approval of new clinical metrics, network-wide or global aggregation, time-series trends, new export fields, new roles or broader disclosure.
- **Relationship to the reporting pause:** [PRODUCT.md](../../PRODUCT.md) and [CONTEXT.md](../CONTEXT.md) keep "Dashboard/reporting feature expansion remains paused pending the upstream flow and data-source audit". This phase is a recorded, bounded exception to that pause; the pause continues to apply to everything outside §2.

## 1. Purpose

Turn the exact-Hospital report page from a text-first report viewer into a dashboard that shows, before the Program rows: relationship and Program volume, Program lifecycle distribution, progress through the six service rounds, and Service 1 record presence. All values are existing, source-backed facts of the authorized report cohort.

## 2. Approved scope

| Area | Change | Boundary |
| --- | --- | --- |
| Direct Hospital OWNER report | KPI summary (6 tiles), Program status donut, Service 1 record-presence bars, round-progress bars with links to the existing `progress` filter | Same capability, cohort (ACTIVE / INCLUDE_ENDED) and exact-Hospital predicates as before |
| Global ADMIN exact-Hospital report | Same charts through the shared `HospitalReportWorkspace` | Links stay on `/app/admin/reporting`; no Program detail links, no ended cohort, no new capability |
| Parent OWNER exact-Child summary | Donut and Service 1 bars drawn from the nine allowlisted values already rendered | No links, tooltips, round progress, extra fields or Patient/Program identifiers; real-data gate unchanged (§6) |
| Excel export | None | Workbook format, endpoints and fields unchanged; the export dataset type explicitly omits the new field |
| Schema / migrations | None | — |

## 3. Data contract

`HospitalReportingPageProjection` gains one field, `serviceProcess: HospitalReportingServiceProcessSummary`. Everything else on the dashboard reuses fields that already existed.

| Dashboard value | Source | Grain | Reused / new |
| --- | --- | --- | --- |
| ความสัมพันธ์ผู้ป่วยกับโรงพยาบาล | `loadSummary()` → `PatientHospitalRelationship.count` | Patient–Hospital relationship (not unique Patients) | Reused |
| ความสัมพันธ์ผู้ป่วยที่ยังไม่มี Program | `loadSummary()` → relationships with `programs: none` | Relationship | Reused |
| Program ทั้งหมด / กำลังดำเนิน / สิ้นสุดแล้ว | `loadSummary()` → `PatientProgram.groupBy(status)` over ACTIVE + COMPLETED | Program | Reused |
| Round progress (ครบ 0–5 รอบ, ครบ 6 รอบ · รอ After, บันทึก After แล้ว · รอจบ Program, สิ้นสุด Program) | `roundProgress` → `PatientProgramRoundCompletion.groupBy(roundNumber)` over ACTIVE Programs without Final Assessment, plus AFTER_RECORDED count and COMPLETED count | Program, mutually exclusive buckets | Reused |
| Programs with Routine / Floating Chart / Dream Card / Confidence record | `loadServiceProcessSummary(db, hospitalId, cohort)` → four `PatientProgram.count` with `some` on the round-1 record (dream card round 3) | Program; categories overlap | **New for the direct/Global page**; the same loader now backs the Parent summary (ACTIVE cohort, unchanged) |
| DM / Pre-DM | — | — | Kept as "ยังสรุปไม่ได้": no approved definition or denominator |

Rules:

- All aggregates run inside the existing RepeatableRead transaction, before the existing final authorization recheck, and use the bare cohort scope. They never depend on search, filters, cursor or the visible page.
- **Round-progress invariant:** `SUM(rounds) + afterRecorded + completed = programs.total`. It holds by construction: round completion is sequential (`assertRoundWritable`) and a Final Assessment requires round 6 (`assertRoundsFinished`), so the telescoping `atLeast(r) − atLeast(r+1)` buckets are non-negative and partition ACTIVE Programs without After. No data inconsistency was found, so no classification changed.
- **Service 1 counts overlap.** One Program can hold several record types; the bars are never summed and the UI says so. A count means "a record exists", not that the service was delivered or succeeded.
- A zero is shown only when the authorized count returned zero. The chart value type (`COUNT | UNAVAILABLE | SUPPRESSED`) keeps non-numeric states out of the drawn chart and never renders them as zero; no current reporting value is unavailable or suppressed.
- No percentage, success rate, outcome score, prevalence rate or new denominator is introduced. Service 1 bars are scaled against total Programs for visual context only; no share is printed.

## 4. UI

- Order: Hospital and cohort context → KPI summary → ภาพรวมการจัดบริการ (status donut, Service 1 bars, round-progress bars) → Export Preview → filters → Overview/Service tabs → `<details>` Program rows → pagination. Overview and Service views, search, filters, cursor pagination, Program detail links (direct OWNER only) and Excel export are unchanged.
- Components: `src/components/reporting-charts/` (`ReportingChartFrame`, `CountBarChart`, `ProgramStatusDonut`, `chart-value`). They are presentation-only, take typed props and perform no authorization or queries. Category mapping shared by both workspaces lives in `app/app/hospitals/reporting/report-chart-categories.ts`.
- Library: Recharts 3.10.1 with `react-is` 19.2.8 (its React 19 peer), using the documented `ResponsiveContainer` with `width="100%"`, fixed height and `minWidth={0}`; charts resize with the workspace (sidebar collapse, viewport).
- Accessibility: the drawn SVG is `aria-hidden` with no tab stop (`accessibilityLayer={false}`); every value is in an adjacent labelled list, with existing filter links where the page already offers them. Empty and non-numeric data render a text message instead of a chart. Colour is never the only carrier: each row has its text label; donut swatches match `--brand` / `--brand-muted` (≥3:1 on white). No animation and no tooltips.
- Layout: KPI tiles 1 → 2 → 3 → 6 columns by workspace container width; chart panels 1 → 2 columns from `@5xl/workspace`; each chart frame splits chart/list from `@2xl/chart`. Long Thai labels use short axis labels plus full labels in the list; every axis label is always drawn (`interval={0}`).

## 5. Deferred

- Time-series trends: deferred until source event timestamps, reporting time semantics and date-window requirements are established. No date-range filter was added.
- Clinical metric charts (DM/Pre-DM, measurements, achievement, outcomes): no approved semantics.
- Network, Global merged or comparison aggregates: `FUTURE_NOT_PRIORITIZED` per [Reporting Access Canonical](../requirements/REPORTING_ACCESS_CANONICAL.md).
- Chart-click drill-down: not added; navigation uses the existing text links.

## 6. Disclosure gates preserved

- Parent exact-Child: the page visualizes only the nine RPT-NET-02C/RPT-32 values. The real-data gate in [Reporting Access Canonical §5](../requirements/REPORTING_ACCESS_CANONICAL.md) (record-time provenance versus the current Parent link, small-count aggregate privacy) is **unchanged and unresolved**; a visual redesign does not lift it.
- Global ADMIN: exact selected Hospital only; no Patient mutation, no Program detail navigation, no ended cohort, no expanded export.
- No new role, capability, query parameter, export field or audit event.

## 7. Verification

| Check | Result |
| --- | --- |
| Reporting service/policy/transport unit tests (`src/modules/reporting`) | Pass |
| Chart component tests (SSR text equivalents; jsdom SVG marks, token fills, no tab stop) | Pass |
| Workspace tests (direct OWNER, Global ADMIN audience, Parent exact-Child) | Pass |
| `tests/integration/hospital-reporting.integration.test.ts` (new Service 1 cohort/scope/overlap assertions) | **Not run** — Docker/PostgreSQL unavailable in the delivery environment |
| Manual browser checks (desktop, collapsed sidebar, tablet, mobile) | **Not run** — requires an authenticated session and database |
