# Phase 15C.4 — Service 2 / Follow-up Integration Hardening & Program Journey Re-audit

Status: implementation complete; authenticated browser/device verification is explicitly limited by the local environment described below.

Date: 2026-08-21

## 1. Baseline commit

The audit started from `main` at:

```text
277f94bd2cb26c33eadd7ce7feff6e816cb15038
fix(program): correct follow-up preview count
```

The worktree was clean before implementation.

## 2. Objective

The objective was to re-audit the complete current-care journey from Patient detail through Patient Program, Service 1, Service 2, Follow-up rounds, Program completion, historical Program reading, and the next Program episode. The audit focused on lifecycle races, authorization drift, exact ownership chains, compatibility-history navigation, contextual Appointment/Screening entry points, and the completed read-only boundary.

No new workflow or deferred Service 2 behavioral semantics were added.

## 3. Audit surfaces inspected

The following were inspected before changing code:

- `docs/CONTEXT.md`
- `docs/architecture/DEMI_ARCHITECTURE_BASELINE.md`
- `docs/adr/`
- Phase 15A business-flow and reporting documents
- Phase 15B0–15B3 Program and Service 1 documents
- Phase 15C0–15C3 Service 2 and Follow-up documents
- `src/modules/patient-program/**`
- `src/modules/goals/**`
- `src/modules/followups/**`
- `src/modules/appointments/**`
- `src/modules/screening/**`
- the affected `app/app/patients/**` routes and views
- `prisma/schema.prisma` and the relevant migrations
- unit and PostgreSQL integration tests
- the current Next.js guidance under `node_modules/next/dist/docs/`

The existing Impeccable UI audit guidance and the repository's responsive design context were also loaded for the affected UI surface.

## 4. Actual gaps found

Two concrete integration gaps were found.

### Appointment contextual wording ignored the effective Program write capability

The completed Appointment detail page correctly routed an actor without Program recording capability to the Program detail page, but its explanatory text still said that the actor could record a new Follow-up. This was misleading and violated the requirement that the UI must not suggest recording when the actor cannot record in the active Program.

### Audit persistence masked retryable transaction conflicts

`recordAuditEvent` converted every database error into `InfrastructureError` before the enclosing serializable service transaction could inspect retryable Prisma errors. The concurrent Program-opening/Baseline integration scenario repeatedly failed at the audit insert with the retry path bypassed. This was a real transaction-integrity defect, not a test-only change.

## 5. Changes implemented

### Appointment CTA context

Added `src/modules/appointments/presentation/appointment-followup-context.ts` as a small pure presentation helper and used it from the Appointment detail page.

- writable ACTIVE Program: the completed Appointment CTA goes to the exact Program Follow-up create route and explains that recording is available in that Program;
- readable but non-writable ACTIVE Program: the CTA goes to the exact Program detail route and explains that recording is not available;
- no ACTIVE Program: the existing relationship compatibility Follow-up route remains available.

Added focused unit coverage in `appointment-followup-context.test.ts` for all three branches, including the no-recording wording assertion.

### Retryable audit conflicts

Updated `src/modules/audit/services/audit-service.ts` to rethrow known `P2002` and `P2034` errors so the existing bounded transaction retry wrappers can handle them. Non-retryable persistence failures remain sanitized as `InfrastructureError`.

Added an audit-service regression test proving that a `P2034` conflict reaches the enclosing transaction boundary unchanged.

No authorization, persistence ownership, schema, or migration architecture was changed.

## 6. Issues inspected and confirmed correct

The following areas were audited and did not require additional changes:

- Program-scoped Goal Plan and Follow-up queries filter by the exact `patientProgramId` and relationship;
- Program detail routes resolve the exact relationship–Program chain before loading nested Goal or Follow-up data;
- Goal Plan and Follow-up detail queries require the exact Program owner;
- Follow-up source Goal Plan options are limited to the same Program, while standalone compatibility Follow-ups use only the pre-Program namespace;
- Appointment linkage is optional, requires the exact relationship, and validates `COMPLETED` status without mutating the Appointment;
- Screening is contextual input only and is validated through the existing relationship-scoped Goal Plan contract;
- Program completion is lifecycle-only and has no Service 1, Goal, Follow-up, measurement, or clinical-result gate;
- completed Programs keep historical reads while server-side mutation paths reject new writes;
- nonce/request-hash replay and conflict behavior is already implemented in the Goal Plan and Follow-up services;
- Program-local round allocation is transactionally protected and backed by the existing database constraints;
- relationship-wide history remains a compatibility/history view rather than current Program ownership.

## 7. Program A → Program B result

The existing PostgreSQL integration coverage was re-audited and passed after the retry fix. It demonstrates:

- pre-Program rows remain nullable historical compatibility data;
- Program A Goal Plans and Follow-ups are visible only in Program A's scoped history;
- Program B starts with independent Goal Plan and Follow-up namespaces, including local round 1;
- Program B does not project Program A records or implicitly adopt pre-Program rows;
- Program A remains readable after completion, including Goal Plan and Follow-up details;
- Program A writes are rejected after completion and cannot be reached through Program B;
- relationship-wide history contains both episodes but preserves each row's owning Program identity and chronology;
- Program B does not implicitly reuse Program A Service 1 state or evidence association.

## 8. Stale lifecycle behavior

Goal Plan creation, Follow-up creation, Service 1 writes, and Service 1 evidence association all re-read and lock the authoritative Program lifecycle inside the mutation transaction. A stale ACTIVE page therefore cannot commit after authoritative completion.

The server actions return conflict/error state only after the service rejects the mutation. Goal and Follow-up forms refresh authoritative state on conflict/forbidden responses and only navigate to a detail route after a successful service result. Completed `/new` routes resolve their create context server-side and redirect to the historical Program detail when the lifecycle is no longer ACTIVE.

Existing completion races passed with the only valid ordering: the business mutation commits before completion, or completion commits first and the later business mutation is rejected.

## 9. Authorization-drift behavior

The relevant access services re-read the actor, User status, Hospital membership/relationship status, Hospital status, and exact OSM assignment for the target relationship. The mutation services do not trust route state, hidden fields, or the previously loaded projection.

Existing stale OSM-assignment coverage passed. Hospital membership, inactive-Hospital, inactive-user, and exact-scope fail-closed behavior was also inspected in the shared access/policy implementations and existing governance/scope integration coverage. No policy weakening or client-side authority was introduced.

## 10. Nested-route isolation

The Goal and Follow-up route families were re-audited:

```text
/patients/:relationshipId/programs/:programId/goals
/patients/:relationshipId/programs/:programId/goals/new
/patients/:relationshipId/programs/:programId/goals/:goalPlanId
/patients/:relationshipId/programs/:programId/followups
/patients/:relationshipId/programs/:programId/followups/new
/patients/:relationshipId/programs/:programId/followups/:followupId
```

Each nested page first resolves the exact relationship–Program detail. Program-scoped queries then require the exact Program and record owner. Mismatched relationship, Program, Goal Plan, and Follow-up combinations fail closed as `NOT_FOUND`/safe rejection rather than rendering a record under a misleading breadcrumb.

## 11. Appointment and Screening contextual behavior

Completed Appointment context remains optional. Appointment detail uses the exact relationship and current Program context; it never makes Appointment persistence Program-owned and Follow-up creation never mutates Appointment state. The server Follow-up service revalidates the Appointment relationship and status, so a forged foreign `appointmentId` is rejected.

Screening remains context/suggestion only. A Screening is not converted into a Goal Plan, and requested Screening ownership is validated by the Goal Plan service. Active Program navigation uses the exact Program route, while stale lifecycle or authorization state is enforced again by the Goal Plan mutation.

The Appointment wording gap described in Section 4 is the only contextual-navigation change made in this phase.

## 12. Relationship compatibility-history behavior

`/app/patients/:relationshipId/goals` and `/app/patients/:relationshipId/followups` remain relationship-wide history views. Their wording identifies them as all-history views, and the current-workflow action points to the ACTIVE Program when one exists.

Program-linked rows navigate to the exact owning Program detail route. Pre-Program rows remain on relationship history detail routes. The implementation keeps Program-local round numbers scoped to their owning Program and does not present them as globally unique relationship rounds.

## 13. Completed Program read-only behavior

Completed Program detail remains readable. Service 1 records and evidence, Goal Plan history/detail, Follow-up history/detail, and available Appointment context remain read paths. Create, attach, and completion controls are omitted from the completed UI projection, but server lifecycle checks remain authoritative for manually entered routes and stale forms.

The UI copy explicitly says that completion is a read-only lifecycle state and does not claim clinical success, Service 1 success, Goal achievement, or Follow-up completion.

## 14. Mobile/accessibility review

Static review of the affected components found the existing responsive patterns intact:

- action groups use wrapping or stack at the small-screen breakpoint;
- primary controls use the repository's minimum-height button styles;
- long labels and recorded notes use wrapping/whitespace-preserving styles;
- forms use associated labels and semantic fieldsets/legends where applicable;
- headings and `aria-labelledby`/`aria-label` relationships remain ordered and explicit;
- focus-visible rings are present on the affected links and controls;
- status text is not communicated by color alone.

Live authenticated inspection at approximately 375–390px, tablet/narrow desktop, and 1280–1440px desktop was attempted with the existing browser tooling. The local protected app returned the safe error state `ระบบไม่พร้อมใช้งานชั่วคราว` because its authentication service was unreachable from the configured local environment. No authenticated journey route could therefore be inspected at those widths. This criterion is not marked as fully verified.

## 15. Regression coverage

The existing tests cover the Program A → B journey, historical compatibility rows, cross-Program and cross-relationship ownership, stale lifecycle submissions, auth drift, optional Appointment linkage, cross-Program source Goal Plan rejection, immutable records, idempotency, concurrent round allocation, and completion races.

New focused regressions cover:

- Appointment CTA wording and destination when an ACTIVE Program is readable but not writable;
- Appointment CTA destination for a writable ACTIVE Program and for the no-ACTIVE-Program compatibility route;
- propagation of a retryable Prisma `P2034` conflict from audit persistence to the enclosing transaction retry boundary.

## 16. Schema/migration status

No Prisma schema or migration change was required. Existing composite ownership constraints, nullable historical linkage, Program-local uniqueness, and restrictive foreign keys remain unchanged. No historical rows were backfilled or reassigned.

## 17. Verification commands and exact results

Focused and full unit verification passed after implementation:

```text
npm test -- src/modules/patient-program   9 files, 62 tests passed
npm test -- src/modules/goals              6 files, 50 tests passed
npm test -- src/modules/followups          5 files, 60 tests passed
npm test -- src/modules/appointments       6 files, 50 tests passed
npm test                                   108 files, 699 tests passed
npx tsc --noEmit                           passed
npm run lint                               passed
npx prisma validate                        passed
npx prisma generate                        passed (Prisma Client v6.19.3)
```

The final disposable local PostgreSQL verification passed:

```text
npm run test:integration                   18 files, 153 tests passed
                                           21 migrations found; no pending migrations
git diff --check                           passed
```

The first two full integration attempts failed at the pre-existing concurrent Program/Baseline scenario because audit persistence masked the retryable conflict. After the audit-layer fix, the final run passed all 18 files and 153 tests.

## 18. Environment limitations

The integration database was the repository's disposable local PostgreSQL environment at `127.0.0.1:55432`; no production or live Supabase data was accessed. The authenticated browser/device audit could not proceed because the local app's configured authentication service was unreachable. The safe error page was observed, but authenticated route layout and interaction at the requested widths remain unverified.

## 19. Requirement-gated items intentionally preserved

This phase did not add or infer any deferred Service 2 behavioral or clinical semantics, including achieved counts, successful-day counts, measurement periods, achievement rates or percentages, Achieve score, obstacles, outcomes, plan adjustment, clinical success, Service 2 completion, Follow-up completion, automatic Goal Plan mutation/versioning, or related legacy percentage behavior.

## 20. Recommended Phase 15 handoff

Hand off the current implementation with no schema work pending. Before the next UI sign-off, provide a working authenticated local browser environment and repeat the complete journey at the requested mobile, tablet, and desktop widths, including completed Program history and Appointment contextual states. Keep the deferred 15C.2 concepts requirement-gated and introduce them only through a separately accepted contract and data map.
