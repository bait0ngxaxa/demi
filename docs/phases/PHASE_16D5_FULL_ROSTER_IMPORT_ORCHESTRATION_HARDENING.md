# Phase 16D.5 — Full Roster Import Orchestration & Compatibility Hardening

Status: implemented for re-audit

Starting reviewed HEAD: `6a15b72856fb2858dc988bd3f7ef02e111289cf3`

This document is included in the focused Phase 16D.5 commit.

## Scope and intent

Phase 16D.5 is an architecture and consistency phase. It does not add import
batch persistence, new clinical semantics, Hospital hierarchy, profile ownership,
or a new workbook contract. The change extracts the Patient roster application
orchestrator from `patient-provisioning-service.ts` while preserving the confirmed
Phase 16D.2–16D.4A behavior.

The extraction was needed because the previous service combined single-Patient
provisioning with canonical candidate normalization, preview state loading,
Baseline reconciliation, Patient Classification reconciliation, OSM resolution,
row transactions, and summary counting. Those responsibilities now have a
one-way application boundary.

## Responsibility boundary

Before this phase, `patient-provisioning-service.ts` was the implementation home
for both core provisioning and the full roster import workflow.

After this phase:

- `patient-provisioning-service.ts` owns single-Patient provisioning, provisioning
  scopes, core authorization wrappers, and temporary compatibility exports.
- `patient-roster-import-service.ts` owns the Patient roster application API:
  preview, confirm-time import orchestration, row readiness, per-row transaction
  coordination, result normalization, and summary creation.
- `patient-roster-import-preview.ts` is a cohesive server-only helper for option
  and candidate normalization, bounded state loading, deterministic preview
  composition, and public-preview projection.
- `patient-roster-import-types.ts` is the bounded roster contract/type module.
- Patient core, Baseline, Classification, and OSM domain mutation rules remain in
  their existing domain transaction seams.

The dependency direction is now transport → canonical adapter → roster import
service → domain transaction/policy services → Prisma. The roster service does
not import `patient-provisioning-service.ts`.

## Canonical and compatibility boundaries

Production preview and confirm continue to call
`readPatientImportCandidates(..., { mode: "CANONICAL" })`. The canonical structural
contract remains `patient-import-template-v1` in
`patient-import-template-contract.ts`: A:AB, 28 columns, two header rows, data
from row 3, and at most 500 rows. H remains Patient phone, Z remains emergency
contact phone, L remains Patient Classification, M remains DTX, and AB remains
OSM caregiver.

`COMPATIBILITY` remains an explicit adapter mode for historical adapter regression
and migration/support tooling. No production action retries canonical parsing with
compatibility parsing, and the canonical mismatch message remains:

> รูปแบบไฟล์ไม่ตรงกับ Template รายชื่อผู้ป่วยของระบบ กรุณาดาวน์โหลด Template ล่าสุดและกรอกข้อมูลใหม่

The template generator and canonical self-parse test remain unchanged in meaning;
the generated blank template contains no Patient data or PII.

## Preview and confirm consistency

The roster service normalizes import options and candidate input at its application
boundary. It validates the effective date, runtime contract version, classification
choices, OSM choices, and server-selected target Hospital. A candidate-supplied
Hospital ID cannot replace the server target; a mismatch is invalidated safely.

Preview performs bounded state reads for the unique identity hashes and, only when
needed, one target-Hospital OSM candidate query. It creates an internal
authoritative preview and projects a separate browser-safe preview. Internal OSM
IDs, User IDs, relationship IDs, auth subjects, and identity hashes are not sent
to the browser.

Confirm continues to:

1. authenticate and authorize the server-derived actor;
2. validate the transport shape;
3. verify the HMAC binding to actor, target Hospital, file fingerprint, effective
   date, and runtime contract version;
4. reparse the exact uploaded file in canonical mode;
5. recompute authoritative preview/current state;
6. validate classification and OSM opaque choices against the recomputed preview;
7. re-evaluate current state in each row transaction before mutation.

No cached browser preview is treated as authoritative, and the runtime contract
version remains `phase-16d4-osm-assignment-v2`.

## Deterministic row evaluation

The established baseline precedence is preserved, including the existing early
Hospital guard when a row is both a Hospital mismatch and a duplicate:

1. canonical candidate validity;
2. target-Hospital text reconciliation;
3. duplicate Patient identity in the input;
4. Patient core existing-state reconciliation;
5. Baseline state reconciliation;
6. Patient Classification state reconciliation;
7. OSM resolution and assignment reconciliation;
8. final row readiness.

Nested diagnostics remain available when multiple domains have issues. For example,
Classification confirmation and OSM reassignment conflict can both remain visible
while the primary row result is `NEEDS_REVIEW`.

Blank Baseline, Classification, and OSM source values remain no assertion; they do
not clear, delete, overwrite, unassign, or otherwise mutate existing state.

## Domain seams and transaction ownership

The roster service composes, without copying domain mutation rules:

- `provisionPatientInTransaction(..., "BULK")` for core Patient provisioning;
- `createPatientBaselineInTransaction(..., "ROSTER_IMPORT")` for initial Baseline;
- `setPatientClassificationInTransaction(..., source: "ROSTER_IMPORT")` for
  current state, history, and audit;
- `reconcileRosterOsmAssignmentInTransaction(...)` for exact target-Hospital OSM
  resolution, assignment, reassignment, and audit.

The roster service owns the row transaction lifecycle. Every executable logical row
uses one `runSerializableTransaction` call. Core, Baseline, Classification, and OSM
mutations for that row share the same Serializable transaction; domain seams accept
the transaction client and do not open nested transactions. Rows are processed
independently, so one unresolved or failed row does not roll back another row.

Supported assertions are all-or-nothing per row. An unresolved Baseline,
Classification, or OSM assertion prevents a partial semantic import. Unexpected
mutation/infrastructure errors become `FAILED`; expected reconciliation outcomes
remain `CONFLICT`, `NEEDS_REVIEW`, `HOSPITAL_MISMATCH`, or `INVALID` as appropriate.
Global authorization loss remains fail-closed rather than being downgraded to a
row failure.

## Preserved domain semantics

Baseline remains date-bound and immutable for source-present roster-owned fields:
create when absent, idempotent NOOP for the same authoritative date/values, date
required when measurements are present without a date, and conflict on differences.
Unrelated Baseline fields are not compared.

Patient Classification remains Patient-global, with `RISK` and `DIABETES` only.
Create and same-value NOOP are idempotent; changes require explicit bound
reconciliation and atomically update current state, history, and audit. Routine
authority remains active direct Hospital OWNER/MEMBER; OSM and ADMIN do not gain
classification mutation authority.

OSM remains exact normalized display-name matching within the target active
Hospital. Zero candidates, indistinguishable candidates, self-only matches, and
invalid source values remain unresolved. Self-assignment, fuzzy matching,
cross-Hospital lookup, arbitrary candidate IDs, and implicit reassignment are not
allowed. Assignment mutation remains OWNER-only; MEMBER can import rows that need
no OSM mutation but receives `OWNER_REQUIRED` when a new or changed assignment is
required.

## Summary and result truthfulness

Summary computation is centralized in the roster service and derives primary
result buckets from final row results. The invariant is:

```text
imported + alreadyExists + duplicateInFile + invalid + conflict
+ needsReview + hospitalMismatch + unsupportedRequirement + failed
= rows.length
```

Domain counters intentionally overlap primary buckets because a row can have a
core result and domain diagnostics at the same time. Domain mutation counters are
derived from row transaction outcomes; blocked-domain diagnostics are derived from
the final row/domain state.

`ALREADY_EXISTS` is a successful idempotent result. It is excluded from the shared
attention predicate, so an all-idempotent import does not display the generic
"มีบางแถวต้องตรวจสอบ" warning. Actual attention states remain invalid, conflict,
needs review, Hospital mismatch, unsupported requirement, and failed.

## Verification coverage

The focused roster service tests cover option and candidate normalization, duplicate
and Hospital precedence, Baseline and Classification state composition, exact OSM
indexing, combined unresolved-row precedence, safe public projection, summary
bucket invariants, and the `ALREADY_EXISTS` attention rule.

Existing synthetic integration coverage remains the behavioral safety net for:

- OWNER complete rows and MEMBER rows with/without OSM mutation;
- all-idempotent rows;
- Baseline, Classification, and OSM creation;
- Baseline, Classification, and OSM conflicts;
- combined confirmation and unresolved assertions;
- late rollback and existing-state rollback;
- independent rows;
- Serializable concurrency races for core identity, Classification history, and
  active OSM assignment;
- canonical template generation and self-parse;
- server-bound actor/Hospital/file/date/contract and opaque OSM/Classifications
  confirmation bindings.

No real roster, Patient identity, phone, address, OSM name, or National ID is used.

## Schema and requirement gates

Prisma schema and migrations are unchanged. No import batch, row, preview, history,
queue, Redis, or generic import persistence was introduced.

The following requirements remain OPEN and are intentionally not implemented:

- `IMP-REQ-03`: Hospital / รพ.สต. hierarchy, parent/child inheritance, and related
  authority/visibility semantics;
- `P16C-PROFILE-01`: DOB, gender, contact, address, emergency contact, and profile
  persistence ownership.

The template's presence of those fields does not authorize persistence.

## Handoff

Phase 16D.5 stops after extraction and re-audit. If the roadmap remains unchanged,
the next phase is **Phase 16D.6 — Import Preview / Confirmation UX & Operational
Polish**, focused on readability, attention guidance, summary polish, canonical
template guidance, and recovery UX. No Phase 16D.6 implementation is included here.
