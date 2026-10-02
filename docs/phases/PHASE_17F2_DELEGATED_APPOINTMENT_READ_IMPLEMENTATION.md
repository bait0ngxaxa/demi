# Phase 17F.2 — Delegated Appointment Read Implementation

## Current-status addendum — Phase 17F.4A (2026-10-02)

[17F.4A re-audit](./PHASE_17F4A_FAMILY_REAUDIT_UAT_READINESS.md) records the complete implemented Family source/security review and PostgreSQL regression evidence; [17F.4B manual device UAT sheet](./PHASE_17F4B_FAMILY_DEVICE_UAT_CHECKLIST.md) contains unexecuted evidence fields. The re-audit found P2 F4A-04: direct `PENDING→REVOKED` SQL could attach caregiver acceptance evidence without an `ACTIVE` transition. It granted no Patient-resource authority but could misstate consent history. Forward-only migration `20261002130000_family_grant_pending_revoke_evidence_guard` and a PostgreSQL regression test close that defect. **17F.1 IMPLEMENTED / CLOSED; 17F.2 IMPLEMENTED (synthetic/demo only); 17F.3 IMPLEMENTED; 17F.4A automated/security/PostgreSQL re-audit = PASS with no unresolved P0/P1/P2. P17F-L04 OPEN — AUTOMATED/INTEGRATION RE-AUDIT COMPLETE; REAL-DEVICE UAT PENDING. P17F-L05 OPEN / FUTURE; Q5 real-data delegated use GOVERNANCE BLOCKED; Phase 17F overall NOT CLOSED.** L01/L02/L03/L06 remain CLOSED / OWNER APPROVED. No real-device/browser evidence or controller/privacy approval is supplied by automated tests. Historical phase sections below remain unchanged.

วันที่: 2026-10-02

Status: **IMPLEMENTED — `family-appointment-read-v1` only, synthetic/demo scope. Real Patient-data delegated deployment/UAT remains GOVERNANCE BLOCKED (Q5).** Phase 17F overall and 17F.4 are not closed. L01/L02/L06 remain CLOSED / OWNER APPROVED for this bounded slice; L03 OPEN, L04 OPEN, L05 OPEN / FUTURE.

Actual starting HEAD: `73418be21382647fe09b619e05ea3a281392eb70` (`docs(phase-17f2b): close delegated appointment read decisions`), clean working tree. No reset/revert/amend or newer work overwritten.

Implementation commit: the commit introducing this handoff, titled `feat(phase-17f2): implement delegated appointment read grants`. Resolve its immutable SHA with `git log --diff-filter=A -1 --format=%H -- docs/phases/PHASE_17F2_DELEGATED_APPOINTMENT_READ_IMPLEMENTATION.md`; the delivery response records that SHA. A commit cannot contain its own hash.

Authority: [owner-approved 17F.2B contract](./PHASE_17F2B_DELEGATED_APPOINTMENT_READ_CONTRACT.md), [decision pack](./PHASE_17F2_DELEGATED_READ_DECISION_PACK.md), [17F.1 foundation](./PHASE_17F1_FAMILY_CAREGIVER_RELATIONSHIP_SECURITY_FOUNDATION.md), [Context](../CONTEXT.md), [Backlog](./PHASE_17_UAT_BACKLOG.md). ADR-0001/0002/0005/0006/0007 remain unchanged; no new role, identity model, impersonation or generic ACL framework.

## Persistence and database invariants

ONE new forward migration: `20261002120000_family_delegated_appointment_read`. Published migrations are unchanged. `CaregiverAppointmentGrant` records exact parent relationship, PatientProfile + Person, caregiver User + Person, one PHR, immutable contract, Patient proposer/time, exact caregiver accepter/time, Patient revoker/time and creation/update timestamps. No names, Hospital name, HN, tokens, arbitrary scope JSON or appointment payload are persisted in the grant. No proposal/grant expiry columns or EXPIRED state.

Composite foreign keys bind:

- parent `(id, patientProfileId, caregiverUserId)`;
- PHR `(id, patientProfileId)`;
- PatientProfile `(id, personId)`;
- caregiver User `(id, personId)`;
- proposing Patient User `(id, patientPersonId)`.

These are restrictive, including update restrictions, and preserve existing source-invitation pair constraints. Exact persisted identities cannot silently remap. Acceptance also checks the parent's accepted source invitation/Person evidence.

A PostgreSQL partial unique index on `(caregiverRelationshipId, patientHospitalRelationshipId, contractVersion)` WHERE status IN (PENDING, ACTIVE) enforces **one actionable lifecycle total**, stronger than separate maximum-one PENDING/ACTIVE indexes; PENDING and ACTIVE cannot coexist ambiguously. REVOKED history permits a fresh new proposal.

Lifecycle CHECK enforces paired acceptance actor/time, exact intended accepter, PENDING without acceptance/revoke evidence, ACTIVE with acceptance and no revoke evidence, REVOKED with Patient revoker/time. Revoked pending rows may have no acceptance evidence. A defensive UPDATE trigger makes scope/version/proposer/creation evidence immutable, preserves accepted evidence and prohibits ACTIVE → PENDING and any update/reactivation of REVOKED rows. Prisma does not represent the partial index, CHECK or trigger; SQL and actual PostgreSQL tests are authoritative for them.

## Proposal, acceptance and revocation

Lifecycle: PENDING → ACTIVE → REVOKED, or PENDING → REVOKED. PENDING conveys no Patient-resource authority. There is no proposal TTL, bearer secret, rejection workflow, automatic expiry, renewal or periodic reacceptance.

Patient SELF proposal accepts exactly `caregiverRelationshipId` and `patientHospitalRelationshipId` under a strict schema. Current ACTIVE User + persisted PATIENT role + exact Person/Profile must hold. Server derives Patient/caregiver/scope and selects `family-appointment-read-v1`; parent must be ACTIVE with exact accepted participant, PHR owned by Patient and Hospital ACTIVE. Foreign inputs fail safely. Duplicate PENDING or ACTIVE returns conflict; no idempotent success/audit duplication. After revoke, re-share creates a NEW row and requires new acceptance.

Acceptance is authenticated/account-bound to the current exact caregiver User/Person; no PATIENT role is needed. A conditional update matches only known-contract PENDING rows plus current account, originating Patient ACTIVE/PATIENT, exact composite-bound identity/scope, ACTIVE parent/source and ACTIVE Hospital. It sets acceptedByUserId and acceptedAt only on success. Opaque grant ID is a locator, not authority.

Revoke/cancel requires the current ACTIVE owning Patient User/PATIENT + exact Profile binding. It terminally transitions only that PENDING/ACTIVE known-contract row, with bounded prior-status audit metadata. It remains possible when the parent or Hospital is ineligible, provided the Patient remains eligible and the deployment gate is enabled. It leaves other grants and the parent unchanged. Disabled gate denies revoke too, as contracted.

Mutations use the existing bounded Serializable transaction/retry convention (P2002/P2034; two retries), conditional state changes and audit in the same transaction. Concurrent accept/revoke ends safely REVOKED: acceptance either commits first then revoke succeeds, or revoke commits first and acceptance denies. Never reactivate a row.

## Server-only deployment gate

`src/lib/env/server.ts` implements `isFamilyDelegatedAppointmentReadEnabled()`: strict literal `true`/`false` parsing, absent/false/invalid = disabled. No NODE_ENV auto-enable and no NEXT_PUBLIC exposure. Test dependency injection is server-side only. Proposal, acceptance, revoke, list and detail enforce it before database work. Grant-management query returns null while disabled; existing relationship invitation/accept/reject/revoke/withdraw/management remains intact. Historical grants convey no authority while disabled.

`.env.example` documents `FAMILY_DELEGATED_APPOINTMENT_READ_ENABLED=false`. Synthetic/demo operators must deliberately opt in. **This operational flag does not supply controller/privacy/legal approval or authorize real Patient data.** Q5 approval evidence must cover the exact six fields, same-PHR ongoing rolling feed/no independent expiry, adult voluntary audience, revoke/eligibility/browser limits and governance notice before real-data enablement.

## Current authority and read projection

Separate Family policy; no Patient SELF ActorContext, inherited PATIENT capability, static role capability, CAREGIVER role or ADMIN/Hospital/OSM fallback.

```text
authenticated current exact caregiver User/Person + ACTIVE caregiver account
+ ACTIVE exact parent and its accepted source/Person binding
+ composite-bound exact PatientProfile/Person and originating Patient User
+ originating Patient ACTIVE + persisted PATIENT role
+ ACTIVE accepted known family-appointment-read-v1 grant, unrevoked
+ exact immutable same-Patient PHR and current ACTIVE Hospital
+ appointment belongs to that granted PHR
+ now <= scheduledAt < now + 90 * 24 hours
+ status IN (SCHEDULED, CANCELLED)
= allow dedicated appointment projection; otherwise deny
```

`delegatedAppointmentSelect` is EXACTLY:

```ts
{ id: true, type: true, scheduledAt: true, durationMinutes: true,
  locationType: true, status: true }
```

Hospital name is selected separately from the authorized grant's PHR → Hospital.name within the same snapshot. Returned DTO keys are exactly `appointmentId` (opaque locator), `hospitalName`, `type`, `scheduledAt`, `durationMinutes`, `locationType`, `status`. User-visible resource data is exactly the latter six fields. Null duration/location stays null; UI says ยังไม่ระบุ. IDs are never presented as Patient information. No locationDetail/note/staff/OSM/creator/contact/acknowledgement/cancellation history/profile/clinical over-fetch or SELF DTO reuse.

Each read obtains one injected/testable `serverNow`, computes an elapsed UTC upper bound `now + 90 × 24h`, and applies it on the server. Lower inclusive, upper exclusive. No past/COMPLETED/NO_SHOW. CANCELLED remains truthfully labelled ยกเลิกแล้ว in-window. Eligible newly created/updated appointments in the SAME PHR appear without reacceptance; a future/new PHR never joins. Detail rechecks current eligibility.

List uses max-50 keyset pagination, `scheduledAt ASC, id ASC`, a 51st-row continuation signal and opaque appointment UUID cursor. The cursor is first resolved with the SAME authority/PHR/window/status predicate, then its scheduledAt/id define the continuation; it cannot enlarge scope. Unknown/foreign/ineligible cursor and unavailable detail yield the same safe NOT_FOUND behavior. Stable datasets have no skips/duplicates. A cursor row later deleted/moved/ineligible returns unavailable; restart the list. No claim of snapshot continuity across separate requests on changing data.

Each list/detail uses a short RepeatableRead read transaction for a consistent authority/name/cursor/row snapshot. The appointment query ALSO contains the current grant predicate via its exact PHR; no later unscoped fetch relies on a stale precheck. A request whose snapshot starts after revoke/withdraw commit denies. A read authorized before commit may already be in flight; this is the approved boundary, not a promise to recall prior responses.

## Parent termination and temporary eligibility

Parent Patient revoke/caregiver withdrawal retains existing semantics and audits. Child rows are not cascaded/terminalized: every read/acceptance requires the immutable original parent ACTIVE. New replacement relationship never inherits old grants. Parent lifecycle actions invalidate delegated paths for UX. No old grant can attach to a replacement parent.

Hospital SUSPENDED/PENDING_VERIFICATION, caregiver non-ACTIVE, Patient non-ACTIVE or missing PATIENT role temporarily deny without revoking grant. The same unchanged eligible entities may resume only while parent and grant remain ACTIVE/unrevoked and contract/scope still match. Terminal revoked grant never resumes through these restorations. No invented PHR lifecycle status.

## Family UI, routes and cache boundary

`/app/family` reuses the existing visual system and resolves the authenticated actor once. It composes existing relationship overview with bounded grant management, without broadening the old relationship queries. Patient selects an ACTIVE named caregiver from the current relationship page and ONE eligible own Hospital by name only (no HN). Grants show PENDING/ACTIVE/history and exact-row cancel/revoke controls. Hospital choices and each grant perspective have bounded 50-row UUID continuation; existing relationship pagination remains available.

Caregiver sees only its own currently eligible PENDING/ACTIVE proposals with Patient management givenName/familyName and granted Hospital name. Pending text explains all six categories, read-only/no Patient actions, ongoing rolling next-90-day eligible same-PHR/new records, no automatic expiry and Patient revocation. Explicit accept, then read navigation. No caregiver reject or appointment mutation controls.

New list/detail routes:

- `/app/family/grants/[grantId]/appointments`
- `/app/family/grants/[grantId]/appointments/[appointmentId]`

Opaque UUIDs only; neither Patient identity nor HN in URLs. Both await installed Next.js 16.3.0 `connection()` and resolve protected actor + server policy each request. No static prerender, shared authorization/Patient cache, use-cache/unstable_cache or stale-while-revalidate. Sensitive navigation sets prefetch=false. Client refresh on focus/visibility return/BFCache restoration rechecks server authority; revalidation after lifecycle is UX invalidation only. Browser-retained/rendered content cannot be recalled. No offline persistence/export/download/print feature. Safe unavailable/empty/loading/error handling reuses Family and shared primitives. Visual/browser UAT is still L04, not certified by source/SSR tests.

Installed Next guides read: connection, previous-model caching, caching/revalidating, linking/navigation and revalidatePath; Next configuration does not enable Cache Components. Context7 Prisma v6 transaction/isolation documentation checked. Supabase/Postgres skill used for composite FK/index/constraint design; no Supabase SDK changes. Existing authenticated Server Action body-size controls remain; distributed/shared abuse protection remains the pre-existing public-exposure hardening gate, not new product semantics.

## Lifecycle audit and security re-audit

Transactional semantic events: `caregiver_appointment_grant.proposed`, `.accepted`, `.revoked`. Resource is grant ID; metadata is contractVersion and priorStatus for revoke only. Exact actors attributed, no names/Hospital name/HN/identity/contact/clinical/token/free-text metadata. No durable read AuditEvent.

Manual final source review verifies: independent Family policy; exact immutable parent/Patient/caregiver/Person/PHR composite binding; originating ACTIVE/PATIENT and caregiver ACTIVE checks; ACTIVE Hospital; accepted known version; server gate; current clock/window/status; explicit select; safe foreign errors; transactional lifecycle/audit; terminal transitions; no future PHR/replacement inheritance; no expiry, QR, role/capability-map widening, impersonation, export or non-appointment resource. Database identity invariants support joins; policy does not trust client-supplied authority. No material source-review finding remains. Real-data governance remains blocked.

## Verification evidence

- `npx prisma validate` — passed; final equivalent direct installed Prisma CLI validate also passed.
- `npm run prisma:generate` — passed, installed Prisma Client 6.19.3; generated node_modules output is not committed.
- `npm run test:db:status` — local isolated PostgreSQL 17 container healthy.
- `npm run prisma:migrate:test` — forward migrations, including the one new grant migration, applied successfully to guarded local `demi_test`.
- `npm run test -- src/modules/family app/app/family` — 9 files / 40 tests passed. After the actor-resolution composition change, focused transport/UI 2 files / 8 tests passed.
- Direct Vitest via repository integration config with guarded `.env.integration` — new grant file 30 tests passed; existing Family foundation file 16 tests passed in the earlier combined run (41 then, before five additional grant cases). No test weakening.
- Integration covers DB pair/PHR/User/Profile FKs, lifecycle CHECK/immutability, uniqueness/history, concurrency, audit rollback, current eligibility/restore, parent termination/replacement, exact projection/nulls, window/status/current updates, new PHR deny, page bounds/order/cursor safety and feature-gate regression.
- `npm run typecheck` — passed after final runtime changes.
- Strict lint uses the available `npm run lint -- --max-warnings=0`; repository has no `lint:strict` script. An initial unused test import warning was removed without changing behavior.
- Repository has no `architecture:check` script; dependency-direction source review and a focused import-boundary scan are used instead. No framework/UI/transport imports in domain services/policies and no database access in UI.
- Impeccable detector on changed UI — `[]` findings. Separate source/SSR UI review found no blocking finding and confirmed incumbent primitives/tokens; no DESIGN.md change warranted. Screenshots/computed visual/browser UAT not run.

Final stable verification:

- `npm run lint -- --max-warnings=0` — passed, zero errors/warnings after removing the unused test import.
- Focused architecture scan — passed for five new service/policy files; UI imports no Prisma/DB implementation. Missing `architecture:check`/`lint:strict` scripts were not invented or reported as executed.
- `npm run test` — **176 files / 1,239 tests passed**, one final full repository unit/UI suite run.
- `npm run build` — **passed**, one final production build (Next.js 16.3.0). Family and both new delegated routes are `ƒ` dynamic server-rendered on demand; no delegated static prerender.
- `git diff --check` and `git diff --cached --check` — passed.
- Strict UTF-8/no BOM/no replacement characters — passed across all 32 changed files. Existing Thai content and historical contract/SELF projection evidence preserved; local links in touched docs resolve.
- Final staged review: 32 intended files only, exactly one new schema migration, no published migration/dependency/lockfile/generated output/role-map/SELF modifications or temporary debugging artifacts. Working tree is clean after implementation commit.

Only documentation records verification results after the full suite/build; runtime and schema remain the tested state. No second full suite or build is justified by those documentation-only updates.

## Remaining gates and limitations

L03 QR OPEN / Phase 17F.3; L04 post-implementation re-audit plus browser/mobile UAT OPEN / Phase 17F.4; L05 automatic expiry/renewal/reacceptance OPEN / FUTURE. Source review and synthetic tests do not close those gates. Real-data delegated deployment/UAT remains GOVERNANCE BLOCKED until external Q5 evidence. No production-ready/real-data approval claim; feature gate was not enabled in the actual deployment environment. Existing distributed/shared abuse-protection hardening gate remains. Browser captures, live authenticated UAT and cross-device retained-content behavior remain unverified.

Explicit exclusions confirmed: no QR; no CAREGIVER role; no Patient impersonation; no non-appointment Patient-resource capability; no automatic grant/proposal expiry; no real-data approval claim.

## Exact changed-file manifest


```text
.env.example
app/app/family/appointment-sharing-pages.test.tsx
app/app/family/appointment-sharing-workspace.tsx
app/app/family/family-management-workspace.tsx
app/app/family/grants/[grantId]/appointments/[appointmentId]/page.tsx
app/app/family/grants/[grantId]/appointments/appointment-fields.tsx
app/app/family/grants/[grantId]/appointments/loading.tsx
app/app/family/grants/[grantId]/appointments/not-found.tsx
app/app/family/grants/[grantId]/appointments/page.tsx
app/app/family/grants/[grantId]/appointments/refresh-delegated-read.tsx
app/app/family/page.tsx
docs/CONTEXT.md
docs/phases/PHASE_17F2B_DELEGATED_APPOINTMENT_READ_CONTRACT.md
docs/phases/PHASE_17F2_DELEGATED_APPOINTMENT_READ_IMPLEMENTATION.md
docs/phases/PHASE_17F2_DELEGATED_READ_DECISION_PACK.md
docs/phases/PHASE_17_UAT_BACKLOG.md
prisma/migrations/20261002120000_family_delegated_appointment_read/migration.sql
prisma/schema.prisma
src/lib/env/server.ts
src/modules/family/domain/appointment-grant-contract.ts
src/modules/family/policies/appointment-grant-policy.ts
src/modules/family/schemas/appointment-grant-schemas.ts
src/modules/family/services/appointment-grant-management-query-service.ts
src/modules/family/services/appointment-grant-service.ts
src/modules/family/services/appointment-grant.test.ts
src/modules/family/services/delegated-appointment-query-service.ts
src/modules/family/transport/appointment-grant-actions.test.ts
src/modules/family/transport/appointment-grant-actions.ts
src/modules/family/transport/appointment-grant-page-context.test.ts
src/modules/family/transport/appointment-grant-page-context.ts
src/modules/family/transport/server-actions.ts
tests/integration/family-appointment-grant.integration.test.ts
```
