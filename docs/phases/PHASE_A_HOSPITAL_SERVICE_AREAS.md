# Phase A — Hospital Network Area Management Foundation

Starting HEAD: `60bd2ad3d5d264e835f11b28f3f95888d2a587b1`. No commit, deployment, shared-database seed or production migration is part of delivery.

> **2026-10-20 amendment — [ADR-0015](../adr/0015-admin-governed-hospital-network.md):** eligibility is now an ADMIN-set network role (`setHospitalNetworkRole` / `clearHospitalNetworkRole`, migration `20261030110000_hospital_network_roles` adds `classifiedByUserId`); candidates are any free ACTIVE CHILD (canonical placement, root/leaf and prior other-Parent history no longer block); `listEligibleServiceAreaCandidates` accepts optional `query` (name/code). ADMIN services in `src/modules/hospital-service-areas/services/hospital-network-governance-service.ts`: `listHospitalServiceAreasForAdmin`, `adminEndHospitalServiceArea`, `transferHospitalServiceArea`. `createHospital` / `renameHospital` live in `hospital-governance-service.ts`. Statements below about offline attestation, canonical placement and blocked transfer are historical. **[ADR-0016](../adr/0016-network-patient-read.md)** then delivered Phase B/C: read-only network Patient access with audit, OWNER-granted MEMBER access (migration `20261030120000_network_patient_read_grant`), network-scoped Parent reports, and the management UI. Statements below that the association grants no Patient/report authority are superseded. **[ADR-0017](../adr/0017-retire-hospital-master.md)** removed Hospital Master, the adoption report (`service-area-adoption-report.ts`) and `Hospital.parentHospitalId`; statements below about canonical pairs and the adoption procedure are historical.

Current decision: [ADR-0014](../adr/0014-operational-hospital-service-areas.md). H1 operational self-management prohibition is superseded; H2–H5 remain intact. Foundation implemented; full business flow, UI, Patient access and real-data acceptance are not complete.

## Persistence and rollout

Migration `20261030100000_hospital_service_areas` adds the eligibility contract and operational association table only. It follows the repository's latest `20261029120000` migration (existing HEAD already contains migrations dated beyond the task date). No existing table data is rewritten. PostgreSQL partial unique active-Child index, distinct-facility/lifecycle checks, restrictive FKs, Parent/lifecycle and Child/history indexes, and immutable-history trigger enforce the core persistence invariants. The trigger rejects hard deletion and all ended-row updates, including reactivation. Prisma Client generation is required before typechecking/deployment. Checks/trigger/partial index are SQL-owned and must be retained in later migrations.

Before rollout, review and apply migration through the usual environment-specific migration deployment process. Do not reset or seed a shared database. No automatic bootstrap runs during migration or application requests. There are initially no eligibility records and no assignments; candidate resolution fails closed. Existing canonical hierarchy, direct memberships and current reports remain usable independently.

Eligibility requires an approved external source of facility kind/eligibility: Hospital Master v2 does not provide it. The new attestation table is an ingestion contract, not an approval UI or a guessed taxonomy. No runtime setter or existing-seed change is shipped. A reviewed source import must identify exact Hospital IDs, PARENT/CHILD kind, source evidence and verification time, and specify withdrawal/correction governance. Do not infer type from facility names or codes.

## Adoption procedure

1. A trusted offline operator runs `reportHospitalServiceAreaAdoption(database: PrismaClient): Promise<ServiceAreaAdoptionRow[]>` from `src/modules/hospital-service-areas/services/service-area-adoption-report.ts`. No public route invokes it. It reads canonical facility pairs and existing history in a repeatable snapshot, without writes.
2. Review BLOCKED_CLASSIFICATION_OR_HIERARCHY and BLOCKED_ASSIGNMENT_CONFLICT; resolve source/placement issues through existing governance. Never seize another Parent's active Child or rewrite history.
3. Once eligibility source onboarding is approved, each direct Parent OWNER can explicitly attach READY_FOR_OWNER_ATTACH pairs through the secured application service. These are new associations, attributed truthfully to that OWNER now; they are not historical imports.
4. Rerun the report: ALREADY_ACTIVE requires no action, ENDED_REQUIRES_EXPLICIT_REATTACH is never automatically restored. Repeat report runs are idempotent; duplicate attach returns conflict and creates neither a duplicate association nor success audit.

No bulk apply/importer is implemented while classification-source ownership is unresolved. A future system bootstrap must be reviewed separately, add truthful system provenance/nullable human actor as needed, use dry-run/apply confirmation and transactionally audit; it cannot invent effective dates or use a human's identity. Current `createdAt` is recording/creation time only.

## Reusable application interfaces

All exported operations in `src/modules/hospital-service-areas/services/hospital-service-area-service.ts` accept `(actor: ActorContext | null | undefined, input: unknown, dependencies?: { database?: PrismaClient })`. They are server-only application primitives, not browser-callable Server Actions. Actor must originate from trusted session resolution, never JSON. Input schemas reject extra fields and normalize UUID case.

| Service | Validated input | Result |
| --- | --- | --- |
| `listManagedHospitalServiceAreas` | `{ parentHospitalId, afterId?, limit? }` | `ServiceAreaPage<HospitalServiceAreaProjection>`; active recorded associations only |
| `listEligibleServiceAreaCandidates` | `{ parentHospitalId, afterId?, limit? }` | `ServiceAreaPage<ServiceAreaCandidate>`; existing ACTIVE attested eligible canonical leaf Children only |
| `attachHospitalServiceArea` | `{ parentHospitalId, childHospitalId }` | new `HospitalServiceAreaProjection` |
| `endHospitalServiceArea` | `{ parentHospitalId, areaId, confirm: true, endReason }` | ended `HospitalServiceAreaProjection` |
| `resolveActiveHospitalServiceArea` | `{ parentHospitalId, childHospitalId }` | active eligible exact-Parent relationship evidence; never a data-access grant |

Projection fields: `id`, `parentHospitalId`, `childHospitalId`, `createdAt`, `endedAt`. Candidate fields: `id`, `hospitalCode`, `name`. Page fields: `items`, `nextAfterId`; default limit 50, maximum 100; opaque UUID-order keyset locator, always scoped and authorized server-side. Managed list preserves the recorded active relationship even when Child status changes; active resolver revalidates current eligibility/placement. No historical reason/actor or unrelated Parent details are exposed. End reason is 1–500 trimmed characters; no arbitrary operational metadata or update service is supported.

Existing `ApplicationError` codes are used: FORBIDDEN for failed OWNER proof, VALIDATION for invalid inputs/ineligible or inconsistent facilities, NOT_FOUND for unknown/foreign areas, CONFLICT for duplicate/current competing assignments, repeated end, blocked transfer or concurrent state change, INFRASTRUCTURE for unexpected persistence/audit failure. An authorized Parent can learn only that an assignment conflicts, not the unrelated Parent identity. No raw Prisma/database errors escape. Repeated attach/end are deliberately conflict-returning, with no repeated success audit. Clients reload after conflict; application transactions do not retry automatically.

## Authority matrix

| Identity | Own exact active attested root Parent area read/manage | Child Patient/workforce/exports from association |
| --- | --- | --- |
| ACTIVE direct OWNER, ACTIVE User with persisted HOSPITAL role | Allow, subject to Child eligibility/lifecycle | No additional authority |
| Parent MEMBER | Deny | No additional authority |
| Child-only OWNER / unrelated Parent OWNER | Deny | No additional authority |
| ADMIN-only | Deny; existing platform governance stays separate | No additional authority |
| OSM-only / PATIENT-only | Deny | No additional authority |
| Suspended/ended membership, inactive account/Parent, stale/revoked role | Deny on next operation | No additional authority |

Multi-role actors still need exact direct OWNER proof. No capability inherits from official hierarchy or an operational assignment. Authorization and audit are revalidated within each Serializable transaction. A partial unique index protects competing attachments even if application-level checks race. End uses a conditional active update and database time; audit and reread must succeed before commit. No external calls occur inside the transaction.

## Phase B/C integration map

| Phase / consumer | Reusable input | Required future work / current boundary |
| --- | --- | --- |
| B network Patient-read access resolver | exact Parent/Child IDs and active service-area evidence | Add a separate named Patient-read capability, approved field projection/purpose/privacy and per-request persisted authority. Compose evidence + Patient queries in one appropriate snapshot; do not authorize via a prior public service result. Keep direct `patient-directory-policy.ts` and existing direct authorization predicates intact. |
| B Patient queries/detail/history | new authorized network-read context | Explicit disclosure/record-time/retention rules, revoked association checks, no writes/provisioning/OSM assignment inheritance. No current consumer reads the new table. |
| C management UI/forms | list/candidate/attach/end services above | Trusted session actor, abuse/request controls, safe localized errors, conflict reload, explicit termination confirmation, loading/empty states and source-classification blockers. Editable fields require a decision first. |
| C work-area selector | separately approved network-read context | Current `application-workspace.ts` still lists direct memberships/OSM contexts only. Do not add Child work membership implicitly. |
| C reports | separately approved source/authority choice | Current `hospital-network-child-report-policy.ts`, `parent-child-hospital-report-access-service.ts` and `resolveHospitalNetworkScope` continue using canonical hierarchy. H2/H5, nine-value summary scope and E1 grants are unchanged. Ending operational assignment does not currently end canonical reporting. Any switch requires an explicit decision and regression/privacy tests. |
| Existing master/onboarding | canonical Hospital identity/parent links | Remain unchanged; reconciliation never overwrites operational assignments. Mismatched assignments retain history and fail active resolution. |
| Workforce, care, appointment, LINE | direct memberships/Patient relationships | No new integration in A; no recipient or authority expansion in B by implication. |

## Verification

Focused domain/policy tests and PostgreSQL integration cover eligibility/strict inputs, OWNER matrix, stale persisted authority, lifecycle/history, competing writes, rollback and permission separation. Integration tests use the repository's local disposable PostgreSQL runner. Append-only fixture cleanup uses a transaction-local test-session trigger bypass limited to fixture UUIDs; no global trigger is disabled and no production cleanup path exists.

Final executed checks (2026-10-20):

| Command | Actual result |
| --- | --- |
| `npm run prisma:generate` | Passed; Prisma Client 6.19.3 |
| `npx prisma validate` | Passed |
| `npm run prisma:migrations:check` | Passed; 70 migrations ordered |
| `npm run typecheck` | Passed, no TypeScript errors |
| `npx eslint src/modules/hospital-service-areas tests/integration/hospital-service-area.integration.test.ts --max-warnings=0` | Passed |
| `npm run test -- src/modules/hospital-service-areas src/modules/hospital-hierarchy src/modules/hospital-onboarding src/modules/reporting src/modules/patient-directory/policies src/components/app-shell/application-workspace.test.ts scripts/business-flow-gap-canonical.test.mjs scripts/migration-order.test.mjs` | 33 files, 292 tests passed |
| `npm run test:integration:focused -- tests/integration/hospital-service-area.integration.test.ts` | 16 tests passed; new migration successfully deployed only to local disposable PostgreSQL 17 |
| `npm run test:integration:focused -- tests/integration/hospital-hierarchy.integration.test.ts` | 4 tests passed |
| `npm run test:integration:focused -- tests/integration/hospital-onboarding.integration.test.ts` | 12 tests passed |
| `npm run test:integration:focused -- tests/integration/hospital-reporting.integration.test.ts` | 8 tests passed |
| `npm run test:integration:focused -- tests/integration/patient-directory.integration.test.ts` | 3 tests passed |
| `npm run test:integration:focused -- tests/integration/database-function-search-path.integration.test.ts` | 1 test passed, including the new trigger function |
| `git diff --check`, strict UTF-8 decode/BOM/replacement-character scan of 19 changed files | Passed; existing Thai text preserved |

Total final PostgreSQL coverage: 44 passing tests across six files. No environmental blockers. An earlier fixture attempted to restore an ENDED workforce membership and correctly hit the existing database guard; the fixture was corrected to use separate actors per status, without weakening that guard or production code. No full repository suite, production build or development server was needed for this isolated additive module. The repository has no `architecture:check` or `lint:strict` script; scoped strict ESLint and direct import/authorization call-site review were used. Review confirmed no current Patient/workforce/report/LINE/workspace consumer imports the new module or uses its assignments.

## Changed-file inventory

| Group | Files |
| --- | --- |
| Domain/validation | `src/modules/hospital-service-areas/domain/service-area-eligibility.ts`; `src/modules/hospital-service-areas/schemas/hospital-service-area-schemas.ts` |
| Authorization | `src/modules/hospital-service-areas/policies/hospital-service-area-policy.ts` |
| Application/maintenance services | `src/modules/hospital-service-areas/services/hospital-service-area-service.ts`; `src/modules/hospital-service-areas/services/service-area-adoption-report.ts` |
| Persistence | `prisma/schema.prisma`; `prisma/migrations/20261030100000_hospital_service_areas/migration.sql` |
| Tests | `src/modules/hospital-service-areas/domain/service-area-eligibility.test.ts`; `src/modules/hospital-service-areas/policies/hospital-service-area-policy.test.ts`; `tests/integration/hospital-service-area.integration.test.ts` |
| Decisions/context | `docs/adr/0014-operational-hospital-service-areas.md`; `docs/adr/0013-responsibility-areas.md`; `docs/adr/README.md`; `docs/CONTEXT.md`; `docs/architecture/DEMI_ARCHITECTURE_BASELINE.md` |
| Requirements/handoff | `docs/requirements/WB_ALIGNMENT_DECISIONS.md`; `docs/requirements/BUSINESS_FLOW_GAP_CANONICAL.md`; `docs/requirements/REMAINING_GAPS.md`; this file |

## Remaining business decisions

Authoritative eligibility source/ingestion/correction governance; approved editable operational fields; transfer approval/acceptance including release and cross-Parent historical ownership; Phase B Patient disclosure, real-data privacy and historical record rules; Phase C UX/report integration and UAT. Nothing in Phase A resolves these by inference.
