# BF-GAP-00/01 — Baseline & Customer Whiteboard Inventory

## Subsequent Review Status — BF-GAP-01R

Independent review identified material defects in the initial BF-GAP-01 inventory. The BF-GAP-00 runtime baseline and reporting freeze remain valid. The initial BF-GAP-01 inventory disposition and counts are historical and are superseded for current status by [BF-GAP-01R — Customer Whiteboard Inventory Correction](./BF_GAP_01R_WHITEBOARD_INVENTORY_CORRECTION.md). BF-GAP-02 has not started.

**Program:** Business Flow Closure Program
**Date:** 2026-10-12 (Asia/Bangkok)
**Repository:** bait0ngxaxa/demi

## Baseline

| Field | Value |
| --- | --- |
| Expected preparation HEAD | `2c71e29d6cc825e858554a2bc6a29b02b45f844c` |
| Branch analyzed | `main` |
| HEAD analyzed | `2c71e29d6cc825e858554a2bc6a29b02b45f844c` |
| Comparison | Exact match; no checkout/reset was used. |
| Working tree before this task | Clean; `git status --short` was empty. |
| Working tree after this task | Two existing documentation files modified and two BF-GAP documents added; no source, runtime, schema, migration, test, generated, or spreadsheet file changed. |

## Scope

BF-GAP-00 established the current runtime baseline and reporting feature freeze. BF-GAP-01 decomposed the four customer whiteboard actor groups into atomic business capabilities with outcomes, inputs/state/readback, evidence pointers, current status, gaps/decision gates, security/privacy boundaries, downstream consumers and audit dependencies.

This was a read-only product/architecture/runtime audit. No feature was implemented and no schema, migration, authorization, route, service, capability, UI, report, export, notification, or user-lifecycle behavior changed.

## Sources inspected

- Repository `AGENTS.md` and the supplied BF-GAP-00/01 task/Owner whiteboard extract.
- `PRODUCT.md`, relevant current and architecture sections in `docs/CONTEXT.md`, and `docs/architecture/DEMI_ARCHITECTURE_BASELINE.md`.
- Required historical/canonical documents: Phase 17A customer-flow contract, Phase 17 UAT backlog, Reporting Access Canonical and RPT-CLOSE-01 handoff.
- Accepted identity, authorization, transport, transaction, workforce and deployment-neutral ADRs: ADR-0001, ADR-0002, ADR-0004, ADR-0005, ADR-0006, ADR-0008 and ADR-0010.
- Relevant later evidence: Phase 17D appointment contract/implementation; Phase 17E.1 and 17E.3; Family, Medication, Wellness and Content/Contact current evidence; Phase 17K.0B; Hospital hierarchy handoff; and current reporting runtime paths.
- Runtime inventory: `app/app`, `app/login`, activation/access-request routes; `src/modules` domains; `prisma/schema.prisma` model and role inventories; targeted searches for operation/policy/query evidence and absence of Area, consent and support runtime.
- `docs/Dashboard App Demi.xlsx`, read-only: sheet titles and output headers were inspected. It was treated as downstream output evidence, not as authority for upstream clinical meaning or calculations.

## Reporting freeze decision

Existing reporting remains preserved: direct Hospital OWNER Dashboard and XLSX, Global Platform ADMIN selected-Hospital Dashboard and XLSX, Parent OWNER exact direct-Child summary, and exact-Program factual reports. No new Dashboard/report/export capability is authorized by this audit. BF-GAP-00..10 can inspect reports and record lineage/dependencies; feature expansion waits for the upstream source-flow audit, except a correctness bug, security issue, regression, or explicitly approved independent requirement.

RPT-CLOSE-01 remains historical evidence for its bounded automated reporting scope. This phase does not alter its evidence and does not interpret it as completion of all customer reporting requirements.

## Whiteboard decomposition method

1. Used the Owner-provided extract for all four customer actor groups; direct Canva access was not used.
2. Split navigation, data views, mutations, lifecycle, readback, delegation, contact, notification, governance and reporting operations where each can receive an independent disposition.
3. Reused Phase 17A IDs when they still referred to the same product intent. Old Phase 17A status is explicitly historical and not copied to current status.
4. Added stable IDs only for capabilities split out of broad historical rows or absent from Phase 17A.
5. Used AUDIT_PENDING where current evidence was not deep enough; used explicit gaps, MISSING, PARTIAL, REQUIREMENT_GATED, INTENT_CONFLICT and SUPERSEDED where evidence supported those distinctions.
6. Kept workbook facts, clinical semantics, authority, privacy approval and runtime existence as separate questions.

## Inventory summary

The [canonical register](../requirements/BUSINESS_FLOW_GAP_CANONICAL.md) contains **132 unique atomic capability records**, including two non-whiteboard rows that preserve current reporting operations during the feature freeze.

| Customer actor group | Records naming this actor |
| --- | ---: |
| คนทั่วไป / ผู้ป่วย | 77 |
| อาสาสมัครสาธารณสุข (อสม.) | 67 |
| เจ้าหน้าที่สาธารณสุข (รพ./รพ.สต.) | 73 |
| แอดมิน รพ. | 76 |

Counts are non-additive: capabilities shared by several actor groups are counted in each named group. Platform ADMIN selected-Hospital reporting and Parent OWNER exact-Child reporting preservation rows are outside the original four whiteboard workflows.

| Current status | Records |
| --- | ---: |
| VERIFIED_COMPLETE | 16 |
| PARTIAL | 59 |
| MISSING | 11 |
| REQUIREMENT_GATED | 22 |
| INTENT_CONFLICT | 14 |
| SUPERSEDED | 2 |
| AUDIT_PENDING | 8 |
| **Total** | **132** |

VERIFIED_COMPLETE applies only to the bounded capability text in the matching row, not production deployment, customer acceptance, or adjacent semantics.

## New / reused capability IDs

**50 existing IDs reused:** AUTH-01..04, NAV-01..04, PAT-01..05, CARE-01..07, APT-01..06, OSM-01..03, STAFF-01..03, OWNER-01..02, AREA-01, FAM-01..02, MED-01..02, WELL-01..03, CONTENT-01..02, NOTIF-01, ACCOUNT-01..02, SUPPORT-01 and RPT-01..02. Their Phase 17A dispositions are preserved in the canonical register as historical traceability only.

**82 new IDs introduced:** 80 whiteboard capability splits/additions plus RPT-33/34, two non-whiteboard records preserving existing reporting operations. IDs: PAT-06..09; CARE-08..25; APT-07..17; OSM-04..11; STAFF-04..07; OWNER-03..14; AREA-02..05; FAM-03..07; MED-03; CONTENT-03; ACCOUNT-03..05; NOTIF-02..08; RPT-31..34. RPT-31/32 represent whiteboard download intent. Existing RPT-03..30 retain their prior meanings. New APT-07..17 IDs are distinct from prefixed Phase 17D decision IDs P17D-APT-07..18.

No existing Phase 17A contract or backlog entry was edited. IDs in this document are register references, not new runtime capabilities or permission constants.

## Known high-risk gaps

1. Customer service rounds 1–6 do not yet map semantically to the normalized Program, Service 1, Goal Plan, Follow-up and Final lifecycle.
2. “แผนสุขภาพ”, “แผนสุขภาพดีของฉัน”, review and Goal Plan are not established as the same artifact.
3. PAM/PROMs and named empowerment tools require approved instruments, language, respondent, scoring and result semantics; prototype definitions are not final clinical requirements.
4. Patient “add service” must remain separate from service request, Patient-authored clinical data, operator care record and OSM assignment.
5. Patient health facts require source/unit/effective-time decisions: BMI, CVD risk, BP, glucose, occupation, diagnosis, family history and current-vs-historical values.
6. Appointment postponement/rescheduling differs from current accepted behavior; the customer request/approval lifecycle and Patient/OSM authority need reconciliation.
7. Family relationship/QR does not grant health-plan or medication read. Accepted delegated appointment v1 is narrower and real-data use is governance-gated.
8. Hospital staff add/download intent differs from current direct MEMBER/OWNER authority; Owner delete vs suspend/history effects and Patient–OSM assignment authority also need decisions. Do not widen MEMBER scope by inference.
9. Responsibility Area has no runtime data model and must remain distinct from Hospital hierarchy, OSM–Hospital association, Patient assignment, geography and authorization scope.
10. Workbook Dashboard/Service Process output fields require upstream lineage decisions. BMI, CVD risk, achievement rate, service completion, outcome, plan adjustment, obstacle and round semantics are not approved by workbook headings alone.

Separate open gates also remain for notification source/recipient/preference/consent/transport/delivery/real-device UAT, terms and consent semantics, and support intake privacy/retention.

## Historical-document reconciliation

Phase 17A and its backlog supplied stable IDs and historical analysis. Current runtime contains substantial post-17A work, including Patient SELF views and appointment interactions, Patient onboarding/service requests, Family relationship and bounded delegated appointment read, medication tracking/schedules, Wellness entries/weight goal, Hospital Contact/Content, and current direct/Global/Parent reporting.

The canonical register reclassifies from current evidence and customer-intent equivalence. Phase 17A status labels are not current dispositions. Its source contract and the historical RPT-CLOSE-01 evidence remain intact. The workbook is used only to identify output columns/sections, not as authority for source definitions or clinical computations.

## Files changed

- Created `docs/requirements/BUSINESS_FLOW_GAP_CANONICAL.md` as the current program register.
- Created this phase baseline/handoff.
- Updated `PRODUCT.md` and `docs/CONTEXT.md` with short links/current program context; no historical phase evidence was rewritten.
- No source, runtime, schema, migration, test, generated, or spreadsheet file changed.

## Verification performed

- Preflight: `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, `git log --oneline -15`; branch/HEAD matched the expected baseline and initial tree was clean.
- Read-only source inventory and targeted ID/domain/runtime searches; read the specified Excel workbook sheets/headers without saving changes.
- Final verification: `git diff --check`; UTF-8/Thai and mojibake review; Markdown link target validation; ID collision/duplicate check; row/status/actor count reconciliation; final diff review; source/runtime/schema change check.
- No npm tests, full suite, build, PostgreSQL suite or typecheck was run, as this is documentation/evidence work and the requested verification scope excludes them.

## Final disposition

**BF-GAP-00/01 — COMPLETE / BUSINESS FLOW INVENTORY BASELINE ESTABLISHED.**

This disposition means the reporting freeze, runtime baseline and atomic customer-flow audit register are recorded. It does not mean the operational business flows are complete or all decisions are resolved.

## Next phase

Product Owner review of the canonical gap register is the next action. The next deep audit entry point is **BF-GAP-02 Runtime Crosswalk & Evidence Verification**, followed by **BF-GAP-03 Core Care / Service Journey** beginning with Screening → Baseline → Program → Service 1 → Goal/Health Plan → rounds 1–6 → extra activity/follow-up → Final → history. This phase does not recommend implementing a feature yet.
