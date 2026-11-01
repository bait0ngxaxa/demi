# ADR-0025: Network Report Export (Parent and All or Selected Network Hospitals)

- Status: Accepted (Product Owner, 2026-11-01)
- Date: 2026-11-01
- Supersedes, **for this export only**: [ADR-0013](./0013-responsibility-areas.md) §3 "Patient-level export … denied" and Parent MEMBER denial, and HN-M08 "Network aggregate export DEFERRED / NOT AUTHORIZED" in [Reporting Access Canonical](../requirements/REPORTING_ACCESS_CANONICAL.md). Amends the [ADR-0019](./0019-owner-administration-and-import-only-roster.md) 2026-10-21 MEMBER export amendment ("`INCLUDE_ENDED` and network reports stay OWNER-only") for this export only. Builds on [ADR-0015](./0015-admin-governed-hospital-network.md) and [ADR-0016](./0016-network-patient-read.md).

## Context

A Parent Hospital reports to its funders for itself and its network ("พื้นที่" = a direct network Child Hospital, ADR-0013; there is no geographic entity). Until now a Parent could download its own customer workbook and, per Child, only the nine-value RPT-32 summary. Producing one network file meant collecting a workbook from every Child OWNER and merging them by hand.

## Customer decisions (2026-11-01)

| Topic | Decision |
| --- | --- |
| Scope | One workbook for the Parent and its whole network, or only the network Hospitals the exporter selects |
| Who | ACTIVE OWNER **or** ACTIVE MEMBER of the ACTIVE Parent (network role PARENT). No grant: `networkPatientReadGrantedAt` and `reportExportGrantedAt` play no role. Standing rule: OWNER and MEMBER have the same rights except Hospital and user management |
| Content | Patient-level rows of every selected Hospital, with audit and an explicit confirmation step |
| Format | One .xlsx from the customer template `docs/Dashboard App Demi.xlsx` (Q1 A) |
| Size | At most 5,000 Programs in total per file |
| Unchanged | RPT-32 nine-value Child summary export; Platform ADMIN single selected-Hospital export (no multi-Hospital ADMIN export) |

## Decision

**Authority.** `resolveNetworkReportExportContext` (`src/modules/reporting/services/network-report-access-service.ts`) rebuilds authority from persisted state on every call: ACTIVE User with the HOSPITAL role, ACTIVE OWNER or MEMBER membership of the exact ACTIVE Parent with network role PARENT. Targets are the Parent and its Children with an active association and ACTIVE status, resolved with the `hospital-network-access.ts` predicates through a new `REPORT_EXPORT` authority (OWNER or MEMBER, no grant). The ADR-0016 Patient-read predicates are unchanged. `scope=ALL` expands on the server; an explicit list (1–200 uuids, deduplicated) must be a subset of the targets, and any other id is refused with a conflict naming the Hospital, never silently dropped. A non-Parent Hospital, a Child OWNER/MEMBER, OSM or ADMIN is refused (404/403). `cohort` ACTIVE (default) or `INCLUDE_ENDED` is allowed for OWNER and MEMBER alike.

**Consistency.** Authority is resolved inside the RepeatableRead read snapshot immediately before any row is read, then re-checked for the exact exported Hospitals after the file is built. An association that ended in between refuses the export (409).

**Dataset.** Per target the single-Hospital export projection (`hospitalReportExportProgramSelect`, same cohort rules, row order, round facts) is read in one batch per Hospital; weekly exercise and round reports are batched across all rows. Bounds are counted first across all targets: total Programs ≤ `NETWORK_REPORT_EXPORT_MAX_PROGRAMS = 5_000`, and the Follow-up, Goal Plan, activity-progress and Goal item limits scale ×5; exceeding any returns 413 before rows load.

**Workbook** (`generateNetworkReportWorkbook`, sharing every writer with the single-Hospital workbook, whose output is unchanged):

- Both template sheets hold the rows of all targets grouped by Hospital (Parent first, then Children by name, then the existing order) with continuous Program numbering. A "หน่วยบริการ" column (name and code) is appended after the round report columns, with the template header style, on every row including continuation rows. No existing column moves.
- Header: "โรงพยาบาล: <Parent> และเครือข่าย (<n> แห่ง)", n = Hospitals in the file; counts are sums over the targets; classification cells as today.
- A third sheet "สรุปรายหน่วยบริการ": one row per Hospital (หน่วยบริการ, รหัส, ประเภท แม่ข่าย/ลูกข่าย, จำนวนเคส, Program ทั้งหมด, ACTIVE, COMPLETED, ความสัมพันธ์ที่ยังไม่มี Program) and a total row; no Patient data.

**Endpoint.** `GET /api/v1/hospital/reporting/network/export?parentHospitalId=…&(scope=ALL | hospitalId=…[&hospitalId=…])[&cohort=INCLUDE_ENDED]` with strict keys, the existing status mapping (400/401/403/404/409/413/503), no-store headers and filename `demi-network-report-<Parent hospitalCode>-<YYYY-MM-DD>.xlsx`.

**Audit.** `hospital_reporting.network_export.prepared|denied|failed` on the Parent: actor, `parentHospitalId`, `accessBasis` OWNER|MEMBER, `exportReference`, `hospitalCount`, `includesParent`, `childHospitalCount`, `programCount`, `cohort`, `generatedAt`; refusals carry the reason and the requested scope and count. Plus one `parent_child_reporting.export.prepared` per exported Child with `scope: "NETWORK_EXPORT"` and the same `exportReference`, written in one statement with the network event. Audit metadata holds scalars only, so the exported Hospital list is the Parent (when `includesParent`) plus the Child events sharing the reference. No Patient data. No audit, no file. Unauthenticated requests are not audited; a verified session denied application access is recorded without request IDs.

**UI.** `/app/hospitals/reporting/export` shows, for each Parent the actor may export, "ทั้งเครือข่าย (แม่ข่าย + ลูกข่าย n แห่ง)" or "เลือกหน่วยบริการ" (searchable checklist, select all / none, per-Hospital case and Program counts from `getNetworkReportExportPreview`), the cohort toggle, totals, a limit message above 5,000 Programs and the confirmation "ไฟล์มีข้อมูลส่วนบุคคลของผู้ป่วยทุกหน่วยบริการที่เลือก" before download. For a Parent this replaces the Parent's single-Hospital MEMBER export panel (selecting only the Parent gives the Parent's rows). Other MEMBER Hospitals keep the single-Hospital panel. A Parent OWNER reaches the page from the report page of the Parent and the Child summary page; navigation is unchanged.

## Consequences

- Parent OWNERs and MEMBERs can download identifiable health data of every network Child; the confirmation, audit and the 5,000-Program bound are the safeguards. The record-time disclosure and small-count questions of Reporting Access Canonical §5 are not answered by this decision.
- A Parent MEMBER gains `INCLUDE_ENDED` in this export only; the single-Hospital MEMBER export stays ACTIVE-cohort.
- The preview counts each Hospital with the single-export summary queries (three per Hospital per cohort); networks of hundreds of Children make the page slower but stay correct.
- Hospital names may appear in a conflict message for an id that is not in the network; names are not Patient data.
