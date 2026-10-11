# Phase 18C.2 — Implementation Readiness Roadmap

สถานะ: **IMPLEMENTATION READINESS ASSESSED — NO RUNTIME WORK AUTHORIZED**

> **Current reporting requirements:** Follow [the canonical Owner requirements](../requirements/REPORTING_ACCESS_CANONICAL.md). This roadmap's Global/Network aggregation candidates and prior ordering are historical design work, not current product prerequisites. The current Parent requirement is per-eligible-Child-Hospital report access. Global ADMIN selected-Hospital reporting and XLSX export are already implemented. Open aggregate privacy decisions apply to future aggregate outputs; they do not by themselves block exact-Hospital Child report access. Field-level disclosure decisions for the Parent audience remain open.

## Current reporting delivery sequence

| Tracking item | Current scope | Evidence/status | Next boundary |
| --- | --- | --- | --- |
| **RPT-NET-01 — Parent-to-Child Reporting Authorization** | Qualifying Parent OWNER selects and reads one eligible direct Child Hospital report at a time; no direct Child OWNER membership is required. | `IMPLEMENTATION_GAP`: structural hierarchy support exists, but exact report access still requires direct OWNER membership at the selected Hospital. | Design and implement a distinct server-side reporting path after the Parent audience field/report disclosure boundary and operation-specific safeguards are defined. No Patient mutation, workforce or Hospital administration authority. |
| **RPT-NET-02 — Parent Child-Hospital Reporting Consumer** | Select a permitted direct Child and view its approved per-Hospital report. | `IMPLEMENTATION_GAP`: no Parent-to-Child reporting selection/access journey is verified. | Depends on RPT-NET-01 and the approved view projection; reuse existing report source and UI where their semantics match. |
| **RPT-GLOBAL-01 / RPT-GLOBAL-02** | Global ADMIN selects, views and exports one eligible Hospital report at a time. | `VERIFIED_IMPLEMENTED` in Phase 18D.2; preserve and verify existing behavior rather than reimplement. | Keep exact selected-Hospital scope; external onward disclosure remains separately governed. |
| **RPT-FUTURE-01 / RPT-FUTURE-02** | Optional Network P/C/N aggregates and merged Global metrics/comparison. | `FUTURE_NOT_PRIORITIZED`; HN/GR historical decisions remain traceable and open where applicable. | Not prerequisites for RPT-NET-01/02 or selected-Hospital ADMIN reporting. |

Slices ในเอกสารนี้เป็น work packages สำหรับ review ในอนาคต. READY_FOR_DESIGN_REVIEW หมายถึงพร้อม review แบบเท่านั้น ไม่ใช่ READY_FOR_IMPLEMENTATION. Product direction ของ Hospital/Global เป็น OWNER_RECEIVED; metric, disclosure, Security/Privacy และ implementation approval ยังคงแยกกัน.

## 1. Readiness matrix

| Capability | Source / runtime availability | Product, business, clinical | Security | Design readiness | Synthetic verification focus | Runtime permission / next gate |
| --- | --- | --- | --- | --- | --- | --- |
| Hospital Dashboard summary | Exact-Hospital classification counts มี; shared summary projection ไม่มี | Product OWNER_RECEIVED; population, denominator และ workbook rules R24A-D01–D15 proposed | Existing Hospital policies; reporting disclosure/count policy open | READY_FOR_DESIGN_REVIEW | exact Hospital isolation, grain, nulls, small-cell policy | NOT AUTHORIZED; resolve population, D08/D12/D14 และ exact-Hospital disclosure |
| Hospital reporting list/detail | Exact Program report มี; Hospital cohort/list projection ไม่มี | Product OWNER_RECEIVED; row grain/status/null/order proposed | Existing exact Program policy; cohort and Patient fields need separate review | READY_FOR_DESIGN_REVIEW | A/B isolation, multiple Programs, stable cursor and fields | NOT AUTHORIZED; customer decisions, scoped list policy, field review |
| Global overview | Global aggregate read projection ไม่มี | `FUTURE_NOT_PRIORITIZED`; no initial Owner requirement for merged system metrics | GR-SEC-01–04/15/16 remain open for any future aggregate | FUTURE / NOT CURRENT PRIORITY | no identifiers, eligible/suspended Hospital, suppression/differencing | Not a prerequisite for Global ADMIN selected-Hospital reports |
| Global per-Hospital comparison | Comparison projection ไม่มี | `FUTURE_NOT_PRIORITIZED`; combined comparison is not the confirmed one-Hospital-at-a-time flow | Global aggregate/selection decisions remain separate and open | FUTURE / NOT CURRENT PRIORITY | metric parity, eligibility, freshness and suppressed cells | Not a prerequisite for Global ADMIN selected-Hospital reports |
| Global ADMIN selected-Hospital report and export | Phase 18D.2 provides selected-Hospital report and XLSX | `VERIFIED_IMPLEMENTED`; current Role.ADMIN, one selected eligible Hospital | Existing exact-Hospital policy and field projection apply | IMPLEMENTED — PRESERVE | selected Hospital isolation and current ADMIN revalidation | Do not require a Global aggregate grant or Hospital OWNER membership |
| Parent OWNER selected direct-Child report | Structural hierarchy support exists; report access still checks direct OWNER at selected Hospital | `IMPLEMENTATION_GAP` | Parent report field disclosure remains open by field/section | NEXT REQUIRED REPORTING FLOW | exact Parent/direct-Child scope, role combinations, deny unrelated Hospitals, approved fields | RPT-NET-01/02 are separate from aggregate HN-M07/history gates |
| Global Patient discovery | ไม่มี Global directory query; direct Hospital directory มี | Searchable fields/population undecided | SECURITY_PRIVACY_BLOCKED; GR-SEC-01/02/05–09/11–15/17–19 OPEN | DESIGN ONLY | exact/partial search, ambiguity, enumeration and revoke-between-pages | NOT AUTHORIZED; bounded search, purpose, Data Controller and Security approval |
| Global Patient identity | Person name/Hospital-local HN exist; Global identity projection ไม่มี | Minimum identity fields/cross-Hospital correlation not accepted | SECURITY_PRIVACY_BLOCKED; GR-SEC-09/17 OPEN | DESIGN ONLY | identity allowlist, ambiguity and same-Person A/B isolation | NOT AUTHORIZED; identity allowlist, ambiguity and correlation rules |
| Global Patient/Program detail | Exact-Hospital Program projection มี; Global grant path ไม่มี | Clinical fields and customer meaning pending | SECURITY_PRIVACY_BLOCKED; grants, purpose, scope, field allowlist OPEN | DESIGN ONLY | exact resource chain, denied fields, cache and revocation | NOT AUTHORIZED; GR-SEC-01/02/05–07/09–15/17–19 and Data Controller/clinical approvals |
| Clinical/derived metrics | Some raw facts exist; several sources/rules missing | BR-01–08 and CL-01–07 pending; no formula accepted | Field disclosure also open | BLOCKED where source/rule missing; otherwise design only | missing/zero/withheld, units, stages, denominator and rule boundaries | NOT AUTHORIZED; source and clinical approval before calculation |
| RPT-24 workbook export | Workbook contract and exact Program source exist; export endpoint/snapshot absent | R24A-D01–D15 PROPOSED | RPT-24C gates OPEN | Design/decision closure only | two-sheet snapshot/count consistency, order, overflow, revocation | NOT AUTHORIZED; separate export, snapshot, authorization, privacy, delivery gates |
| Hospital Network export | Aggregate contract only; no export permission | HN decisions unchanged | HN-M07/history open; HN-M08 DEFERRED / NOT AUTHORIZED | DEFERRED | child Patient denial and no hierarchy export | NOT AUTHORIZED; separate future Network decision |

## 2. Historical Phase 18C design slices — aggregation and other reporting candidates

The following A–I packages preserve the earlier Phase 18C design work. Their ordering does not supersede the current delivery sequence above. Global/Network aggregation items are future scope unless reprioritized; exact-Hospital Child report work must be assessed under RPT-NET-01/02 and its own field-level boundaries.

ทุก slice ต้องได้ approvals ที่เกี่ยวข้องและ implementation authorization แยกก่อน code. Decision IDs เป็น dependencies ไม่ใช่การปิด decision.

### A. Shared factual field contracts

- Scope: ตกลง source, row grain, timestamp meaning, absent/null/zero/withheld และ factual DTO boundary.
- Reuse: existing ProgramReportingProjection และ Baseline, Classification, Assignment, Program, Goal Plan, Follow-up, Final services.
- Data/schema: ไม่เปลี่ยนใน slice แรก; missing facts คง blocked จนมี source decision.
- Decisions: R24A-D02/D06/D07/D10/D11/D12/D15; BR/CL ที่เกี่ยวข้อง; GR-SEC-09/10.
- Policy/query/DTO: carry exact Hospital/relationship/Program context; no generic Person aggregate; no field outside approved view allowlist.
- UI: none.
- Depends on: customer field decisions and source-owner/clinical review.
- Synthetic verification: linked/unlinked Baseline, missing Final, multiple Programs, Follow-up 0/1/6/>6, null vs zero vs withheld.
- Risk/rollback: interpretation drift; version projection changes and withdraw fields if consumer meaning is disputed.
- Readiness: READY_FOR_DESIGN_REVIEW for existing facts; missing/clinical fields BLOCKED. Implementation NOT AUTHORIZED.
- DoD after authorization: signed field map; each field has source, writer, scope, time and synthetic state; no clinical derivation added.

### B. Exact-Hospital bounded reporting read

- Scope: server-resolved Hospital filter, approved row grain, bounded Program/relationship list, exact navigation context.
- Reuse: patient-directory-query-service, patient-program-query-service, program-report-access-service and existing exact Program projection only where policy semantics match.
- Data/schema: none expected for initial read if approved facts suffice; no gap converted to inference.
- Decisions: R24A-D01–D05/D11–D15; BR-01/D06 as relevant; Hospital field/cohort disclosure; RPT-24C only if separate export is later proposed.
- Policy/query/DTO: Hospital predicate before row query, stable cursor/page bound; list DTO separate from exact Program detail DTO.
- UI: future Hospital summary/list navigation after data contract; no UI in this slice.
- Depends on: A and approved Hospital cohort/Patient field disclosure.
- Synthetic verification: A/B isolation, same Person in A/B, multiple Programs, stable cursor, reassignment, policy/grant changes.
- Risk/rollback: cross-Hospital exposure; disable consumer path and retain existing exact Program page.
- Readiness: READY_FOR_DESIGN_REVIEW. Implementation NOT AUTHORIZED.
- DoD after authorization: server tests prove exact Hospital predicate, minimized fields, page bounds, denial and no hierarchy inheritance.

### C. Hospital Dashboard summary and navigation

- Scope: summary sections and route from authorized Hospital scope to B and current exact Program report.
- Reuse: approved catalog composition from A/B and existing report presentation patterns.
- Data/schema: none unless signed business decision identifies a missing source.
- Decisions: applicable R24A-D01/D06/D08/D10/D12–D15; relevant BR/CL; privacy/security field display.
- Policy/query/DTO: same metric key/version as Global where comparison is valid; no unapproved Patient rows in summary.
- UI: Hospital Summary → Hospital Program/Patient Reporting List → exact Patient/Program report.
- Depends on: A, B, metrics, direct Hospital access and disclosure approvals.
- Synthetic verification: count consistency, missing/empty states, unauthorized Hospital, status change.
- Risk/rollback: misleading service/completion/outcome label; remove affected metric or restore current navigation.
- Readiness: READY_FOR_DESIGN_REVIEW. Implementation NOT AUTHORIZED.
- DoD after authorization: approved labels, accessibility/layout review, exact-scope tests and metric parity.

### D. Global non-identifying aggregate

- Scope: system-wide overview over eligible Hospitals; no Patient identifiers or raw rows.
- Reuse: approved metric catalog/source queries; not governance directory as a Patient endpoint.
- Data/schema: none for already approved aggregate sources; count/snapshot shape may need query design.
- Decisions: GR-SEC-01–04/13/15/16; R24A-D01/D08/D14; relevant BR/CL and small-cell/differencing review.
- Policy/query/DTO: Role.ADMIN plus explicit summary grant; approved Hospital population; aggregate-only response.
- UI: Global Overview only.
- Depends on: metric/population approval and independent Security/Privacy/Controller review as applicable.
- Synthetic verification: no IDs/rows in response, eligible/ineligible Hospital, small-cell suppression and repeated-filter differencing.
- Risk/rollback: inference from aggregates; disable affected dimensions/metric/view under approved operational control.
- Readiness: READY_FOR_DESIGN_REVIEW. Implementation NOT AUTHORIZED.
- DoD after authorization: scoped server query, aggregate privacy tests, audit evidence and shared metric version.

### E. Global per-Hospital comparison

- Scope: aggregate comparison rows for explicitly eligible Hospital set using the same definitions as C.
- Reuse: D metric catalog and C composition.
- Data/schema: no change without measured evidence; design result shape/freshness semantics.
- Decisions: GR-SEC-01–04/13/15/16; R24A-D01/D14/D15; business population and privacy approvals.
- Policy/query/DTO: selected Hospitals from grant/server policy; no Parent-child inheritance; aggregate only.
- UI: comparison → authorized Hospital Context.
- Depends on: D and common approved metric version.
- Synthetic verification: A/B metric parity, suspended Hospital, different freshness, suppressed cells.
- Risk/rollback: invalid comparison from population/as-of mismatch; disable affected comparison.
- Readiness: READY_FOR_DESIGN_REVIEW. Implementation NOT AUTHORIZED.
- DoD after authorization: signed common definitions and eligible-Hospital tests.

### F. Global Patient directory authorization and discovery

- Scope: separately authorized discovery; does not imply clinical detail.
- Reuse: bounded input-validation and domain relationship source; do not widen direct Hospital directory.
- Data/schema: none unless approved search fields require new persistence.
- Decisions: GR-SEC-01/02/05–09/11–15/17–19; R24A-D02–D05/D12; Controller purpose and identity-field approvals.
- Policy/query/DTO: Platform ADMIN + directory capability/grant, Hospital set, purpose, allowlist, exact/partial rule, bounded page/rate.
- UI: future Patient Discovery view only after approval; no assumption of unrestricted name/National ID search.
- Depends on: independent issuer, purpose, eligible set, field allowlist and enumeration controls.
- Synthetic verification: exact/partial search, ambiguous Person, cross-Hospital identity, enumeration, revoke before next page.
- Risk/rollback: sensitive population enumeration; revoke grants, invalidate cursors and disable entry per approved procedure.
- Readiness: DESIGN ONLY / SECURITY_PRIVACY_BLOCKED. Implementation NOT AUTHORIZED.
- DoD after authorization: accepted threat controls/tests for search scope, leakage, caching, audit and revocation.

### G. Global Patient/Program detail

- Scope: exact Hospital → relationship → Program detail with independently approved identity/clinical fields.
- Reuse: existing exact Program read/projection as base only after Global grant and field review.
- Data/schema: only explicitly approved source/capture work; no inference or direct schema change in this phase.
- Decisions: GR-SEC-01/02/05–07/09–15/17–19; R24A-D04–D07/D09–D12; applicable BR/CL; Controller and clinical authority.
- Policy/query/DTO: grant bound to Hospital/resource/case/time/fields/purpose; exact DB predicates and field allowlist in query/serialization.
- UI: exact detail navigation after directory authorization; no attachment/free-text by default, mutation or export.
- Depends on: F, identity ambiguity/correlation, grant/revocation and audit decisions.
- Synthetic verification: same Person in A/B, out-of-grant Hospital, unapproved field, narrative/attachment, revoke mid-page.
- Risk/rollback: sensitive disclosure; revoke grant, invalidate future reads/cache and retain minimum audit.
- Readiness: DESIGN ONLY / SECURITY_PRIVACY_BLOCKED. Implementation NOT AUTHORIZED.
- DoD after authorization: field-to-approver lineage, exact resource-chain tests, denial/revocation/audit tests.

### H. Clinical metric or data-capture extension

- Scope: only approved missing measurement/event source or clinical derivation.
- Reuse: existing Baseline/Follow-up/Final write owners remain authoritative; extend owning module only after source decision.
- Data/schema: may require capture workflow/schema/migration, each separately designed and approved; never backfill fabricated values.
- Decisions: CL-01–07, BR-01–08, R24A-D06/D07/D09/D10/D12; Clinical/Data Owner, Controller and Security/Privacy.
- Policy/query/DTO: source, observation time, unit and provenance must be explicit before metric projection.
- UI: only owning care workflow if approved, not dashboard-only calculation.
- Depends on: authoritative capture decision before schema/calculation design.
- Synthetic verification: units, corrections, unavailable values, clinical boundaries, multiple stages and missing source.
- Risk/rollback: incorrect clinical output; stop publishing metric and retain source provenance/correction trail.
- Readiness: BLOCKED for absent source or unapproved formula. Implementation NOT AUTHORIZED.
- DoD after authorization: clinical sign-off for source/formula/version and synthetic boundary validation.

### I. RPT-24 workbook/export

- Scope: exact-Hospital on-demand workbook only under its own contract; no Global or HN export.
- Reuse: approved exact-Hospital source/read design and RPT-24/RPT-24A work.
- Data/schema: snapshot/provenance design may be required; no export implementation exists.
- Decisions: R24A-D01–D15 plus RPT-24C authorization, privacy, coherent snapshot, audit and delivery.
- Policy/query/DTO: separate export permission, exact Hospital scope, approved fields/row grain; requestedAt, dataAsOf and generatedAt distinct.
- UI: download only after full export approval; excluded from current Global views.
- Depends on: customer population/field approval, security, privacy, snapshot and delivery.
- Synthetic verification: two-sheet count consistency, order/overflow, revocation, file handling and no cross-Hospital rows.
- Risk/rollback: downloaded copy persists outside DEMI; stop issuing files under approved retention/incident policy.
- Readiness: DESIGN/DECISION CLOSURE ONLY. Implementation NOT AUTHORIZED.
- DoD after authorization: RPT-24C evidence, accepted workbook contract, snapshot tests and delivery controls.

## 3. Current risk-based order

1. **RPT-NET-01:** define and implement the narrow Parent OWNER → eligible direct Child report authorization path, reusing the current hierarchy resolver and exact-Hospital report services only where semantics match. Keep any unapproved fields out of the Parent projection.
2. **RPT-NET-02:** provide the Child selection and exact-Hospital report consumer after RPT-NET-01 and its view projection are ready.
3. **RPT-GLOBAL-01 / 02:** preserve Phase 18D.2 selected-Hospital ADMIN view and XLSX; do not create a merged report.
4. **RPT-FUTURE-01 / 02:** revisit Network or Global aggregates only after independent prioritization and their own source, privacy, and authorization decisions.
5. Keep separate RPT-24 Program workbook contracts and clinical/data-capture decisions scoped to their own requirements; they do not redefine the confirmed reporting journeys above.

This document records readiness only. It does not authorize runtime implementation. Aggregate HN-M07 and historical aggregate attribution gates do not automatically block an exact-Hospital Parent-to-Child read; unresolved Parent field, historical content, audit, or disclosure requirements apply only to the affected operation/data.

## 4. Synthetic verification plan

ไม่มี scenario ใด execute ใน Phase นี้; fixtures ต้อง synthetic-only. ตรวจ factual result แยกจาก access decision. Open decisions ต้องปิดก่อน expected output จะเป็น acceptance assertion.

| # | Synthetic fixture | Expected factual result | Access precondition / decision dependency | Evidence after authorized implementation |
| --- | --- | --- | --- | --- |
| 1 | Program under Hospital A; caller selects B | A facts never appear in B | exact Hospital scope; D01/D03 | query/result proves A-only rows |
| 2 | Same Person has relationships in A and B | relationship facts stay isolated | Person join is not permission; D03/GR-SEC-17 | no cross-Hospital identity or clinical leakage |
| 3 | One relationship, two Programs with different Goal Plans | exact Program gets only linked facts | D02; exact Program scope | Program A/B projection isolation |
| 4 | Program with and without linked Baseline | linked fact or explicit missing state; no fallback | D06 | distinct linked/missing behavior |
| 5 | Imported Baseline then Program opened | import alone creates no Program; linking only follows current service rule | existing import/Program policies | no implicit/duplicate Program |
| 6 | Reimported Baseline conflicts with existing source | existing source owner reconciliation applies; no silent overwrite assumption | correction rule pending | conflict/no-op/update evidence |
| 7 | COMPLETED Program without Final | lifecycle completed; Final remains missing | D06/D12 | no inferred success or synthetic Final |
| 8 | Follow-ups 0, 1, 6, >6 | factual 0..N; six is not persistence limit | D11 | stable pagination and accepted overflow |
| 9 | Goal target exists; achieved days absent | target only; achievement unavailable | R24A-D09, BR-04; D12 only if approved missing-value behavior applies | no target-to-achievement conversion |
| 10 | unknown, zero, withheld, unauthorized | preserve distinct states | D12/GR-SEC-09/10 | serializer/UI does not collapse values |
| 11 | One Person, two Hospital relationships, one classification | relationship denominator may differ from Person denominator | D03/D08/CL-04 | approved denominator label/no silent dedup |
| 12 | OSM reassigned after historical Program activity | current assignment does not rewrite historical responsibility | D05/BR-08 | no historical attribution inference |
| 13 | Global ADMIN with summary-only grant | aggregate only within approved scope; Patient rows denied | GR-SEC-01–04/15/16 | response has no IDs/rows; summary access audit evidence; detail denied |
| 13b | Global ADMIN with per-Hospital summary grant for Hospital A only | A aggregate may be allowed; B aggregate and all Patient rows denied | GR-SEC-01–04/15/16; grant Hospital set approved | A-only scope and summary audit evidence; no detail implication |
| 14 | Global ADMIN with bounded Patient grant | only approved exact resources and fields allowed | GR-SEC-01/02/05–07/09–15/17–19; Controller approval | in-scope allow/out-of-scope deny |
| 15 | Global ADMIN without reporting grant | deny despite Role.ADMIN | GR-SEC-01/15 | no aggregate or Patient payload; denial audit evidence |
| 16 | Hospital OWNER requests Global view | deny without separate Platform grant | GR-SEC-01/02; context separation | membership never implies Global access |
| 17 | Parent OWNER requests an exact direct-Child Hospital report | Evaluate under the separate Parent-to-Child report policy; aggregate authorization neither grants nor denies this operation. Unapproved Patient/clinical fields remain excluded until their field boundary is decided. | OR-RPT-01; Parent report field/audit safeguards remain open; HN-M07 applies to future aggregate outputs | Enforce exact Child scope; do not infer Patient detail or export authority |
| 18 | ADMIN + HOSPITAL multi-role actor | evaluate explicit request context; no additive bypass | GR-SEC-01/02 | role/context isolation evidence |
| 19 | Grant revoked between page requests | next page denied; cursor revalidated/invalidated | GR-SEC-12–15 | no post-revoke page and audit result |
| 20 | Actor inactive/suspended or Hospital suspended | deny; not empty-success | GR-SEC-01/04 | current status revalidation and safe failure |
| 21 | Repeated searches enumerate population | approved bounds/rate/abuse handling applies | GR-SEC-05/08/14/15 | threshold, audit and safe response |
| 22 | Caller requests unapproved identity/clinical field | deny or omit per approved contract; fail closed | GR-SEC-09/10 | field allowlist assertion |
| 23 | Detail route attempts CSV/XLSX, bulk API or mutation | deny; read grant does not expand action | GR-SEC-18; RPT-24C open | no artifact/download/mutation |
| 24 | Detail asks for attachment bytes or free text | deny absent separate field/file permission | GR-SEC-10 | no body or storage URL in response |
| 25 | Two actors/grants share apparent cache path | no shared Patient result; revoke invalidates future reads | GR-SEC-13/14 | cache isolation/no-store evidence |
| 26 | Aggregate subgroup small or filters differ slightly | suppress/withhold under approved privacy policy | GR-SEC-03/04/16 | suppression and differencing tests |
| 27 | Same approved metric/population in Global and Hospital | same key/version/result when comparison is valid | D01/D08/D14; GR-SEC-03 | parity on same synthetic facts/as-of |
| 28 | CVD Risk Score lacks accepted source/algorithm | no score; raw fact remains separately scoped | CL-03 | absence not zero; no provisional formula |

## 5. Approval, implementation and stop conditions

ก่อน implementation ต้องมีหลักฐานที่ตรงขอบเขต:

- Product/Customer: R24A-D01–D15 and accepted workbook population, row grain, labels, missing-value/order decisions; currently PROPOSED.
- Business/Operations/Clinical: applicable BR-01–BR-08 and CL-01–CL-07; formulas, stages, units, denominators and capture approved by authority.
- Security/Privacy: applicable GR-SEC-01–GR-SEC-19; exact scope, issuer, purpose, revocation, allowlist, audit, search abuse, cache and aggregate privacy.
- Data Controller: purpose/legal basis, minimum necessary fields, allowed disclosure, retention, review cadence, incident handling and audit access. Architecture documentation is not legal approval.
- Architecture/Engineering: bounded query/projection, consistency/freshness, paging, source ownership, failure behavior and any separately approved ADR proposal.
- Explicit implementation authorization: scope, owner, release boundary and synthetic verification plan. Phase 18C.2 supplies none.

Release stops:

1. Global Patient discovery/detail deny until Security/Privacy/Controller gates close and a separate grant policy is approved.
2. Clinical metric with missing source/rule/time/unit is withheld; no formula invented.
3. RPT-24 export stays blocked until RPT-24C closes; Global grant never implies export.
4. HN-M08 remains DEFERRED / NOT AUTHORIZED; this phase does not advance Network export.
5. Authorization/revalidation/audit failure fails closed; no fallback to Role.ADMIN, membership, report:program:read or hierarchy.
6. Phase 18C.2 closes as design/readiness handoff only. Do not start implementation automatically.

## 6. State summary

- Parent-to-Child exact-Hospital reporting: `CONFIRMED_OWNER_REQUIREMENT`; runtime access path remains an implementation gap and Parent field disclosure remains open.
- Global ADMIN selected-Hospital report and XLSX: `VERIFIED_IMPLEMENTED` in Phase 18D.2 and must be preserved.
- Global merged aggregation/comparison: `FUTURE_NOT_PRIORITIZED`; its decision gates are not prerequisites for selected-Hospital reporting.
- Network P/C/N aggregation: `FUTURE_NOT_PRIORITIZED`; HN aggregate privacy/history gates do not by themselves block exact Child report access.
- Global security contract: PREPARED / APPROVAL PENDING; GR-SEC-01–19 OPEN.
- Global Patient access: SECURITY_PRIVACY_BLOCKED.
- R24A-D01–D15: PROPOSED FOR CUSTOMER REVIEW.
- Clinical/business rules: APPROVAL PENDING.
- Data Controller approval: PENDING.
- HN-M08: DEFERRED / NOT AUTHORIZED.
- RPT-24C export gates: OPEN.
- This roadmap grants no new runtime implementation authorization.

## 7. References

- [Architecture Blueprint](./PHASE_18C2_REPORTING_ARCHITECTURE_BLUEPRINT.md)
- [Field Lineage and Metric Catalog](./PHASE_18C2_FIELD_LINEAGE_AND_METRIC_CATALOG.md)
- [Phase 18C.1B security contract](./PHASE_18C1B_GLOBAL_REPORTING_SECURITY_CONTRACT.md), [security decisions](./PHASE_18C1B_SECURITY_DECISION_REGISTER.md), [acceptance matrix](./PHASE_18C1B_SECURITY_ACCEPTANCE_MATRIX.md)
- [Phase 18C.1 decisions and gates](./PHASE_18C1_DECISION_REVIEW_REGISTER.md), [implementation gate matrix](./PHASE_18C1_IMPLEMENTATION_GATE_MATRIX.md), [Global requirement reconciliation](./PHASE_18C1A_GLOBAL_REPORTING_REQUIREMENT_RECONCILIATION.md)
- [Phase 18B data gaps](./PHASE_18B_EXCEL_DATA_GAP_VERIFICATION.md), [RPT-24 export contract](./PHASE_17_RPT24_ON_DEMAND_ASOF_EXCEL_EXPORT_CONTRACT.md), [RPT-24A workbook pack](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md)
- [Patient import contract](./PHASE_16D4A_CANONICAL_PATIENT_IMPORT_TEMPLATE.md), [import release gate](./PHASE_16E_PATIENT_IMPORT_END_TO_END_RELEASE_GATE.md), [Phase 15E projection foundation](./PHASE_15E1_PROGRAM_REPORTING_PROJECTION_FOUNDATION.md), [Phase 15E.2 integration](./PHASE_15E2_PROGRAM_FACTUAL_REPORT_UI_INTEGRATION.md)
- [HN-C0 closeout](./PHASE_17K0B_HN_OWNER_DECISION_CLOSEOUT.md), [HN-C1 security boundary](./PHASE_17K_HNC1_SECURITY_DISCLOSURE_CONTRACT.md)
