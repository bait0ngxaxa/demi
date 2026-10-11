# Hospital Hierarchy Integration Handoff

**Status:** implemented for development and synthetic-demo use. No production rollout, schema migration, Patient access expansion, or network aggregate exposure was performed.

## Master reconciliation

The approved `HospitalMaster` worksheet and `prisma/seed/hospital-master-v2.json` contain the same 78 canonical codes, Thai names, and parent mappings: 43 main Hospitals and 35 subordinate facilities. The reconciliation validates source identities and references, self-parenting, cycles, direct main-to-subordinate topology, database identity integrity, and categorized differences.

`node scripts/seed-hospital-master.mjs` is read-only by default. `--apply` is required to write and is limited to local development, test, or synthetic-demo databases. Existing name and parent changes require separate `--confirm-name-changes` and `--confirm-parent-changes` flags. Apply uses a serializable transaction and advisory lock, preserves IDs and statuses, creates missing rows as `PENDING_VERIFICATION`, and never deletes Hospitals or changes memberships, accounts, or clinical relationships. Invalid database topology blocks apply.

The read-only dry-run against local synthetic PostgreSQL `demi_test` reported 78 `MISSING_HOSPITAL`, 35 `MISSING_PARENT`, 4 `UNEXPECTED_HOSPITAL`, and zero `MATCHED`, `PARENT_MISMATCH`, `NAME_MISMATCH`, or `INVALID_HIERARCHY`. The four unrelated Hospitals were retained. The dry-run made no database writes. Integration tests separately reconciled a unique synthetic 78-record fixture and verified explicit correction behavior.

## Hierarchy runtime and interfaces

`getHospitalHierarchyDirectory` provides the Platform Admin directory without an arbitrary row limit. `buildHospitalHierarchyDirectory` classifies root/main and subordinate Hospitals from the current self-reference and surfaces orphaned, cyclic, duplicate, or nested structures as diagnostics. `getHospitalHierarchyContext` revalidates the active direct OWNER membership (or active Platform Admin role) and returns only identity, status, current parent, direct-child count/list where applicable, and topology diagnostics. A subordinate context shows its parent and no siblings.

`resolveDirectChildFacilities` returns `parentHospitalId === parent.id` only. `resolveHospitalNetworkScope` accepts an active direct OWNER of an active main Hospital and models P as the exact parent, C as ACTIVE direct children, and N as their union. Platform Admin directory access does not grant this Parent-owner scope. Pending and suspended children remain in the organizational directory and are omitted from C. The resolver returns Hospital IDs only; it does not grant Patient access or compute metrics.

The Platform Admin route `/app/admin/hospitals` groups the full directory by main Hospital, shows direct-child counts and statuses, supports keyboard-accessible expansion, links each unit to its existing governance detail, and keeps inconsistent units visible in a diagnostic section. Existing suspend/restore controls remain on the same detail route.

The Hospital OWNER route `/app/hospitals/reporting` now shows the selected unit's current organizational context. Main Hospital owners see a read-only direct-child list with status labels; subordinate Hospital owners see their parent identity. Patient/Program rows, measures, detail links, and XLSX remain exact-Hospital scoped. The dashboard states this scope explicitly and identifies Network aggregates as unavailable and Network export as unauthorized.

## Authorization and remaining gates

- Platform Admin directory access uses the existing Hospital governance capability and revalidates the active ADMIN role.
- Structural owner context requires an active user, `Role.HOSPITAL`, an active direct OWNER membership, and an ACTIVE selected Hospital. A child OWNER cannot request the parent's context by supplying its ID.
- Reporting continues to use the Phase 18D.1 exact-Hospital policy and `PatientHospitalRelationship.hospitalId` predicate. The Hospital selector remains based on directly owned Hospitals.
- No Patient identifiers, clinical rows, or patient-derived cross-Hospital values are included in hierarchy projections.
- HN-M07 privacy rules, historical reparent disclosure, and HN-M03 detailed eligibility remain gates for future Network aggregates. HN-M08 Network export remains deferred and unauthorized.
- Phase 18D.2 Global Admin reporting needs its own authorization and exact-Hospital query entry point; it must not widen Hospital OWNER access.

## Verification

- `npm run test -- src/modules/hospital-hierarchy/services/hospital-master-reconciliation-service.test.ts src/modules/hospital-hierarchy/services/hospital-hierarchy-service.test.ts app/app/admin/hospitals/hospital-hierarchy-directory.test.tsx app/app/hospitals/reporting/hospital-report-workspace.test.tsx src/modules/reporting/transport/hospital-report-page-context.test.ts` — passed.
- `npm run test:integration:focused -- tests/integration/hospital-hierarchy.integration.test.ts` — passed against local synthetic PostgreSQL.
- `npm run test:integration:focused -- tests/integration/hospital-reporting.integration.test.ts` — passed; exact-Hospital Dashboard, authorization, and XLSX regression coverage retained.
- `npm run test -- src/modules/reporting/services/hospital-report-workbook-service.test.ts src/modules/reporting/services/hospital-report-access-service.test.ts src/modules/reporting/services/hospital-report-query-service.test.ts src/modules/reporting/transport/hospital-report-page-context.test.ts app/app/hospitals/reporting/hospital-report-workspace.test.tsx` — passed, including the two required worksheet names.
- `npm run typecheck` — passed.
- Targeted `npx eslint` across changed TS/TSX/MJS files — passed.
- `npm run architecture:check` is not defined in this repository's `package.json`; module imports were reviewed and typecheck/lint passed.
- `node scripts/seed-hospital-master.mjs --integration --dry-run` — read-only PostgreSQL reconciliation passed: 78 approved records, 4 existing synthetic Hospitals retained as unexpected, 78 missing approved records, 35 missing parent references, and no invalid hierarchy.
- Authenticated browser smoke was not performed; no isolated browser account/session was available. The UI is covered by server-rendered presentation tests, not a live browser flow.
