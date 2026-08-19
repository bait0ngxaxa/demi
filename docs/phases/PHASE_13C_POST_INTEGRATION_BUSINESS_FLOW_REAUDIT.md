# Phase 13C — Post-Integration Business Flow Re-Audit

**Status:** Complete — analysis/documentation only<br>
**Audit date:** 2026-08-19<br>
**Rewrite HEAD audited:** `c3054107fa066000120906855b6078bb4308ce2e` (`fix(demo): make patient provisioning continuation capability-aware`)<br>
**Legacy inspection source:** `C:\Users\Bait0ng\Desktop\legacy-demi\demi-plus-web-v2`

This audit evaluates whether the post-13B.0 rewrite has enough meaningful business-flow breadth and continuity for a customer requirement workshop. It does not evaluate page-for-page legacy parity and it does not authorize implementation of any residual item.

## 1. Executive Verdict

| Item | Verdict |
| --- | --- |
| Golden journey status | Journeys A–E all complete as `PASS_WITH_WORKSHOP_NOTE`; no accepted onboarding-to-care journey is blocked by a current implementation gap. |
| Demo blocker status | **NO** — no current `DEMO_BLOCKER` finding. |
| Overall prototype breadth | The rewrite covers the meaningful accepted chain from Hospital onboarding through workforce activation, Patient provisioning/assignment, Screening, Goal Plan, Appointment, Follow-up, profile/baseline/evidence, and governance/lifecycle boundaries. It intentionally does not reproduce every legacy screen or unresolved business rule. |
| Phase 14 recommendation | **Recommendation C — Requirements First.** Use the working prototype to resolve the remaining customer and operational semantics before adding another product slice. Workshop preparation may be documented separately; Phase 14 implementation has not started. |
| Overall workshop verdict | **`DEMO_READY_FOR_REQUIREMENT_WORKSHOP`** — subject to the documented demo dataset, manual handoffs, storage configuration, and open-requirement questions. |

The conclusion is deliberately narrow: the current prototype is broad enough to demonstrate the accepted business narrative. It is not a conclusion that reporting, recovery, Patient self-service, reconciliation, clinical amendment, OSM geography, or all legacy maintenance utilities are complete.

## 2. Audit Scope and Evidence

### 2.1 Rewrite evidence

The audit inspected the rewrite at the stated HEAD, including:

- [Project context](../CONTEXT.md), [architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md), and the [accepted ADR index](../adr/README.md).
- [Phase 13A — Demo Flow Gap Analysis](./PHASE_13A_DEMO_FLOW_GAP_ANALYSIS.md) and [Phase 13B.0 — Demo Continuity Working Prototype](./PHASE_13B0_DEMO_CONTINUITY_WORKING_PROTOTYPE.md).
- `app/` routes and server boundaries for login, onboarding, `/app`, workforce, Patient provisioning/activation, Patient directory/detail, assignment, Screening, Goals, Appointments, Follow-up, Baseline, Evidence, and governance.
- `src/modules/` policies, actor-context/workspace services, application services, transport/server actions, and focused tests for each audited capability.
- `prisma/schema.prisma` and the current model/enumeration set, read-only, to distinguish implemented business records from absent reporting, notification, recovery, or repair models.
- `tests/` unit, transport, and PostgreSQL integration coverage. No browser-level test was treated as evidence of a complete cross-journey run; continuity was evaluated from the actual route/service/policy wiring.

The accepted evaluation boundary remains:

```text
Person != User
Registration != Account Activation
Role != Capability != Scope
Role + Capability + Scope -> Policy Decision

Platform ADMIN != Hospital Owner
Hospital Owner = Role.HOSPITAL
                 + exact active HospitalMembership(OWNER)

Client state is never authority.
Server-side policy is authoritative and fail-closed.
Hospital hierarchy does not widen Patient access.
OSM Patient access is assignment-scoped.
Patient provisioning does not imply OSM assignment.
Patient self-service is not currently accepted.
Account recovery remains unresolved/deferred.
```

These boundaries were used to judge semantic coverage. Legacy ability to open a page as an Admin, select a Hospital from client state, or edit/delete a row was not counted as accepted rewrite authority by itself.

### 2.2 Legacy evidence

The local checkout remained the primary inspection source as required:

```text
C:\Users\Bait0ng\Desktop\legacy-demi\demi-plus-web-v2
```

The local checkout was clean at inspection time and its local Git metadata identified commit `7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e` (`แสดงผู้ป่วยexcell`, 2026-07-12). This is the same legacy revision pinned by Phase 13A. No discrepancy was observed between the local content and that local Git metadata. The local path was not removed or replaced with a GitHub-only source during this phase; existing GitHub commit links were treated only as supporting context.

The bounded discovery sweep inspected the meaningful route and utility areas below:

```text
app/admin/hospitals/
app/admin/staff/
app/admin/patients/
app/admin/screening/
app/admin/goals/
app/admin/appointments/
app/admin/dashboard/
app/admin/statistics/
app/admin/correct-data/
app/admin/cleanup-goals/
app/admin/address-migration/
app/admin/knowledge/
app/admin/villages/
app/admin/register/
app/api/admin/
app/api/import-locations/
lib/supabase/
scripts/import-from-excel.js
```

The most material observations were:

- `app/admin/dashboard/page.tsx` presents operational entry points for Patients, Screening, Goals, Appointments, staff, reports, and settings, with basic counts and quick actions.
- `app/admin/statistics/page.tsx` describes Patient, Hospital, activity, and Excel/PDF export reporting, but is explicitly marked `กำลังพัฒนา`. This is evidence of a possible reporting need, not a settled reporting contract.
- `app/admin/correct-data/page.tsx` and its related APIs identify missing profiles, incomplete names/HN, invalid or duplicate identity numbers, and duplicate HN cases, with edit/delete controls. This is strong evidence for an Admin data-quality/exception responsibility; the direct service-role edit/delete semantics are not accepted rewrite semantics.
- `app/admin/cleanup-goals/page.tsx` groups duplicate `weekly_activity` rows by Patient/date/goal and deletes older IDs. This is evidence for reconciliation/repair work, not approval of destructive deletion in the rewrite.
- `app/admin/address-migration/page.tsx` and `app/api/import-locations/route.ts` move or normalize legacy address data. This is most consistent with migration/maintenance tooling unless recurring product evidence is found.
- `app/admin/knowledge/page.tsx` is a Patient article/video management surface explicitly marked `กำลังพัฒนา`.
- `app/admin/villages/page.tsx` manages village records and Hospital coverage. This supports an open question about OSM/geographic scope, but does not prove that a village relationship should authorize Patient access.
- Legacy registration, temporary OSM/emergency staff, ID verification, local-storage role checks, predictable birth-date passwords, and direct destructive operations are implementation-specific or unsafe behavior rejected by the accepted rewrite boundary.
- No defined legacy recovery workflow, notification delivery contract, or Patient-facing portal route was found in the checkout. The legacy login and temporary-password behavior is not a safe account-recovery specification.

## 3. Golden Journey Re-Audit

The following results are against the current post-13B.0 implementation, not the pre-13B.0 gaps recorded in Phase 13A.

| Journey | Current Result | Remaining Friction | Verdict |
| --- | --- | --- | --- |
| **A — Platform Admin / Hospital onboarding**<br><br>Pending public Hospital application → Admin review → approval → applicant uses a separate login → Hospital Owner workspace | The public onboarding form persists a pending application. A server-authorized Admin review can approve it in a transaction that activates the Hospital, activates the applicant account, assigns `Role.HOSPITAL`, and creates the exact active `HospitalMembership(OWNER)`. The approval continuation states that the applicant is now the Hospital Owner and sends the demonstrator to `/login`; `/app` re-resolves the actor from the authenticated provider subject and projects the Owner workspace. There is no impersonation or hidden account switch. Evidence: `app/hospital/onboarding/`, `app/app/admin/hospital-onboarding/`, `src/modules/hospital-onboarding/`, `src/modules/auth/services/actor-context-service.ts`. | The approval screen does not log the applicant in automatically. The demonstrator must use the applicant’s own password in a second login ceremony. Verification evidence, notification channel, and any appeal/rejection communication are not defined. | `PASS_WITH_WORKSHOP_NOTE` |
| **B — Hospital Owner / workforce**<br><br>Owner login → actor-aware `/app` → workforce → provision Member/OSM → activation handoff → target activation/login → useful target workspace | `/app` derives active Hospital context and exposes workforce actions only from server-side policy projection. Workforce provisioning returns authoritative Hospital/relationship context and presents a one-time activation link/QR when activation is needed. The target sets the password and then logs in through the normal boundary; the Owner cannot set or see a target password and cannot impersonate the target. Selected `hospitalId` values are revalidated against the Owner’s direct scope. Evidence: `app/app/workforce/`, `app/activate/workforce/`, `src/modules/workforce/`, `src/modules/auth/`, `src/components/app-shell/`. | The Owner must hand the link/QR to the target, and the target must perform a separate activation and login. A target with multiple Hospital relationships needs an explicit context choice when a later operation requires it. The target landing is useful but intentionally bounded rather than a finished role-specific portal. OSM geography, transfer, and Doctor/Nurse-specific authority remain open. | `PASS_WITH_WORKSHOP_NOTE` |
| **C — Hospital / OSM Patient care**<br><br>Provision Patient → authorized Detail → OSM assignment → assigned OSM workspace → Screening → Goal Plan → Appointment → Follow-up → Profile/Baseline/Evidence/History | Hospital Owner/Member and OSM paths are separate. Single provisioning returns the authoritative `relationshipId` and `hospitalId`; the continuation opens Patient Detail only where the actor has direct Hospital read. OSM provisioning alone does not grant Patient read, activation, or assignment. An Owner assigns an active OSM relationship to the exact Patient–Hospital relationship; the OSM then uses `/app/patients/assigned`. Patient Detail links to Profile, Baseline, Evidence, Assignment, Screening, Goals, Appointments, and Follow-up. Screening detail links to Goals with `screeningId`; Goal Plan detail links to Follow-up with `sourceGoalPlanId`; completed Appointment detail links to Follow-up with `appointmentId`. Each destination revalidates the exact relationship and policy boundary. Evidence: `app/app/patients/`, `src/modules/patient-provisioning/`, `src/modules/patient-directory/`, `src/modules/patient-assignment/`, `src/modules/screening/`, `src/modules/goals/`, `src/modules/appointments/`, `src/modules/followups/`, `src/modules/patient-baseline/`, and `src/modules/patient-evidence/`. | The OSM path requires an Owner handoff for assignment. Bulk import returns a directory continuation rather than a per-row detail list. Evidence upload needs the configured private storage bucket. Screening scoring, Goals, measurements, follow-up progress, and Baseline remain explicitly provisional; navigation does not create hidden clinical records or recommendations. | `PASS_WITH_WORKSHOP_NOTE` |
| **D — Patient**<br><br>Provisioned Patient → first-time activation → login → current Patient landing | Patient activation is a purpose-specific one-time flow. The Patient establishes the password, returns to `/login`, and reaches `/app`; the server-derived actor context exposes only the bounded Patient landing message and no Hospital/OSM/Admin capability links. There is no invented Patient portal or unexpected clinical visibility. Evidence: `app/app/patients/activation/`, `app/activate/patient/`, `app/login/`, `app/app/page.tsx`, and `src/modules/auth/`. | Activation still requires a trusted demonstrator to hand over the link/QR. The current stop at an account-ready landing is intentional and does not claim Patient self-service. Account recovery is not available. | `PASS_WITH_WORKSHOP_NOTE` |
| **E — Governance / lifecycle**<br><br>Staff membership lifecycle, OSM relationship lifecycle, Hospital lifecycle, and Owner governance | Existing routes remain reachable from the actor-aware workspace and detail surfaces. Staff membership supports bounded profession update and suspend/restore for ordinary members. OSM suspend/restore is guarded against current Patient assignments and restore does not recreate assignments. Platform Admin can perform status-only Hospital `ACTIVE ↔ SUSPENDED` transitions with stale-write protection and no hidden cascade. Owner promotion/demotion is scoped to the exact active Hospital membership and preserves a final eligible Owner invariant. Evidence: `app/app/admin/hospitals/`, `app/app/workforce/`, `src/modules/hospital-governance/`, `src/modules/workforce/`, and related tests. | The demonstrator needs a prepared second eligible Owner and suitable assigned/unassigned OSM fixtures to show guard behavior. Hospital suspension has no accepted appeal, notification, session-revocation, or cascade semantics; the prototype intentionally shows blocked operational scope rather than inventing those rules. | `PASS_WITH_WORKSHOP_NOTE` |

### 3.1 Journey conclusion

Every journey has an executable next step or an explicit, safe scope boundary. Manual login/activation handoffs and the Patient landing are workshop notes, not business-flow blockers. The cross-module identifiers carried by the rewrite are authoritative relationship, Hospital, application, activation, Screening, Goal Plan, and Appointment identifiers; browser-selected role, Hospital, or Patient values are not treated as authority.

## 4. Business Capability Coverage Matrix

`COVERED` means the meaningful capability is represented sufficiently in the current prototype. `COVERED_DIFFERENTLY` means the business purpose is represented under the accepted architecture without reproducing legacy structure. `PARTIAL` means a material portion exists but a meaningful portion is absent. The remaining classifications follow the Phase 13C definitions: `MISSING_HIGH_CONFIDENCE`, `OPEN_REQUIREMENT`, `INTENTIONALLY_DEFERRED`, `LOW_VALUE_FOR_DEMO`, and `LEGACY_ONLY_MAINTENANCE`.

| Capability Family | Rewrite Evidence | Legacy Evidence | Classification | Demo Impact | Requirement Confidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Authentication / Login | `/app/login`, password-authentication service, provider subject → server actor context, safe invalid-login behavior | `app/admin/login` uses Supabase login, localStorage identity, and first-role selection | `COVERED_DIFFERENTLY` | None | HIGH | The rewrite separates identity/account/authorization and does not reuse local-storage authority. Recovery is separate and unresolved. |
| Account Activation | Workforce and Patient activation routes use purpose-bound one-time credentials; target sets the password and returns to `/login` | Legacy registration and temporary staff flows generate/display predictable or temporary passwords | `COVERED_DIFFERENTLY` | Workshop handoff | HIGH | Activation is not recovery; the rewrite preserves target ownership and avoids predictable credentials. |
| Hospital Public Onboarding | Public Hospital application form and server service create a pending application against a canonical Hospital master | `app/admin/register` is a broad legacy registration path with client-side role choices and generated passwords | `COVERED_DIFFERENTLY` | None | HIGH | Accepted onboarding is Hospital-led and does not allow a caller to self-select platform role. |
| Hospital Verification / Approval | Admin review detail and atomic approve/reject service | Legacy Hospital/admin routes and dashboard support administrative Hospital work, but do not define the accepted approval invariant | `COVERED` | None | HIGH | Approval produces an active Hospital and exact Owner membership; applicant logs in separately. Verification evidence remains open. |
| Hospital Governance | Platform Admin Hospital directory/detail and policy-authorized status actions | `app/admin/hospitals`, dashboard/settings, and hierarchy-oriented navigation | `COVERED_DIFFERENTLY` | None | HIGH | Current governance is explicit Platform Admin control-plane work, not Hospital Owner impersonation or hierarchy-wide Patient access. |
| Hospital Lifecycle | Bounded `ACTIVE ↔ SUSPENDED` status-only mutation with stale-write defense and audit | Legacy Hospital status/navigation behavior exists but cascade semantics are not a trustworthy requirement source | `COVERED_DIFFERENTLY` | Workshop note | HIGH | Suspension blocks operational scope without silently changing memberships, assignments, or clinical history. Appeal, notification, and session semantics remain open. |
| Hospital Owner Governance | Exact active Owner membership, `MEMBER ↔ OWNER`, final eligible Owner invariant, transactional audit | Legacy staff/role pages select role/client state without the accepted Owner invariant | `COVERED_DIFFERENTLY` | None | HIGH | Platform Admin and Hospital Owner remain different actors. |
| Workforce Provisioning | Owner-scoped Member/OSM provisioning resolves/reuses Person/User and creates the correct relationship | `app/admin/staff/add`, `register`, temporary/emergency/ID flows | `COVERED_DIFFERENTLY` | None | HIGH | The accepted standard workforce path is covered; temporary/emergency cases are not assumed to be parity requirements. |
| Workforce Activation | `/activate/workforce`, one-time activation record, target-owned password, separate login | Legacy temporary password and birth-date password handoffs | `COVERED_DIFFERENTLY` | Workshop handoff | HIGH | Link/QR/assisted presentation is supported as delivery of the same activation capability. |
| Staff Membership Lifecycle | Staff detail controls update provisional profession and suspend/restore ordinary membership | Legacy staff pages offer add/edit/verify/deactivate/delete variants | `COVERED_DIFFERENTLY` | None | HIGH | Owner protection and account-vs-membership separation are deliberate. Broader staff transfer/emergency semantics remain open. |
| OSM Hospital Relationship Lifecycle | Owner-scoped suspend/restore with active-assignment guard and no implicit assignment recreation | Legacy OSM/staff utilities and village/coach handling mix association and operational access | `COVERED_DIFFERENTLY` | Workshop fixture | HIGH | Relationship lifecycle is covered; geography, transfer, and assignment semantics beyond the current slice remain open. |
| Patient Provisioning | Single and Excel flows resolve/reuse identity, create Patient role/profile/Hospital relationship, return authoritative continuation | Legacy Patient registration/import and profile writes | `COVERED_DIFFERENTLY` | None | HIGH | Provisioning does not imply activation, Patient read, or OSM assignment. |
| Patient Bulk Import | Preview/confirm binding, file fingerprint, row classifications, duplicate/conflict summary, Hospital-scoped authorization | `app/admin/patients/import-excel`, `scripts/import-from-excel.js` | `COVERED_DIFFERENTLY` | Workshop data prep | HIGH | The rewrite is safer and relationship-scoped; bulk success continues to the directory rather than pretending to provide per-row authoritative detail links. |
| Patient Activation | Owner-scoped lookup and one-time Patient activation route; activation changes account state only | Legacy Patient registration/import generated or exposed birth-date-derived passwords | `COVERED_DIFFERENTLY` | Workshop handoff | HIGH | Patient self-service after login is intentionally not included. |
| Patient Directory | Direct Hospital directory and assigned OSM directory use server pagination/search and relationship predicates | Legacy broad Admin directory, Hospital filters, coach filters, client-side role/Hospital filtering | `COVERED_DIFFERENTLY` | None | HIGH | Parent/child hierarchy and Platform Admin role alone do not widen Patient access. |
| Patient Detail | Relationship Detail is the authorized hub to profile and care-history continuations | Legacy broad Patient detail and global clinical links | `COVERED_DIFFERENTLY` | None | HIGH | Current detail projection is intentionally minimal/read-only and relationship-scoped. |
| OSM Assignment | Owner-only assignment/unassignment to an exact Patient–Hospital relationship; one active assignment invariant | Legacy `coach_id`/coach-name behavior and network filtering | `COVERED_DIFFERENTLY` | Workshop handoff | HIGH | Legacy coach semantics do not prove OSM authority; current assignment is first-class and explicit. |
| OSM Assigned Patient Access | `/app/patients/assigned` and care policies require active OSM relationship plus exact active assignment | Legacy OSM could open broad Patient pages through client checks and Hospital filters | `COVERED_DIFFERENTLY` | None | HIGH | This is the accepted assignment-scoped boundary, not a missing Hospital-wide OSM directory. |
| Screening | Versioned source-defined form, server validation/scoring, historical rounds, detail/history, direct Goals continuation | Legacy screening pages/history and Patient detail links | `COVERED_DIFFERENTLY` | None | HIGH | The score is explicitly provisional and not a clinical recommendation; no Goal is auto-created. |
| Goals / Activity Plan | Explicit Goal Plan creation/history, optional validated Screening context, direct Follow-up continuation | Legacy goals/setup/history and duplicate-cleanup utility | `COVERED_DIFFERENTLY` | None | HIGH | Goal selection, adherence, care-plan approval, correction, and clinical meaning remain provisional. |
| Appointments | Relationship-scoped lifecycle with create/reschedule/cancel/complete/no-show, history/detail, direct Follow-up after completion | Legacy global and Patient appointment lists/forms/follow-up paths | `COVERED_DIFFERENTLY` | None | HIGH | Current actor/field semantics are a validation prototype, not a final clinical workflow. |
| Follow-up / Progress | Immutable relationship rounds, optional validated Appointment/Goal context, activity progress, direct continuation | Legacy follow-up forms/history/detail | `COVERED_DIFFERENTLY` | None | HIGH | No hidden Appointment/Goal/Screening side effects. Measurement, correction, and clinical interpretation remain open. |
| Patient Profile | Read-only selected eight-field projection in Patient Detail | Legacy broad edit form and profile fields | `PARTIAL` | Workshop note | HIGH need / LOW exact fields | Present: bounded read projection. Absent: field ownership, visibility, Patient/self editability, amendment, and full legacy field parity. |
| Patient Baseline | Relationship-owned immutable Initial Snapshot with explicit provisional warning | Legacy baseline route and broad Patient detail | `COVERED_DIFFERENTLY` | None | MEDIUM | Cardinality, required fields, units, correction, and comparison semantics remain open. |
| Patient Evidence / Status Artifacts | Append-only relationship-level image artifacts, private storage, integrity metadata, signed view URLs, scoped policy | Legacy Patient status/tracking and image/file behavior | `COVERED_DIFFERENTLY` | Storage prerequisite | MEDIUM | Delete, replacement, retention, amendment, malware/OCR, and generic document ownership are not implemented. |
| Admin Data Quality / Reconciliation | No current Admin repair/reconciliation route or service; provisioning only detects some import conflicts | `correct-data`, `get-problems`, `update-patient`, `delete-problems`, `cleanup-goals` | `MISSING_HIGH_CONFIDENCE` | Meaningful non-blocking residual | HIGH need / LOW semantics | A real operational responsibility is evidenced, but authority, repair types, merge/delete policy, audit, and recovery must be designed rather than copied. |
| Duplicate Identity / Exception Handling | Identity reuse and import classifications detect duplicate/conflicting input; no post-hoc exception queue or resolution command | `correct-data` detects duplicate ID/HN and incomplete identity; cleanup removes duplicate goal rows | `PARTIAL` | Meaningful non-blocking residual | HIGH need / LOW resolution semantics | Detection exists at entry points; post-hoc resolution, merge/link, correction, and historical-record handling are absent. |
| Account Recovery | No recovery route/service/model; login and first-time activation remain separate | Legacy login and temporary-password utilities, but no safe proof/channel/session contract | `OPEN_REQUIREMENT` | Meaningful non-blocking residual | HIGH need / LOW semantics | Do not infer password reset, provider reset, ThaID/IAM proof, or final Owner recovery from legacy behavior. |
| Reporting / Dashboard | `/app` shows actor/workspace scope; no reporting service, aggregate dashboard, or export module | Legacy dashboard counts/quick actions; statistics page describes reports and Excel/PDF export but is marked `กำลังพัฒนา` | `OPEN_REQUIREMENT` | Requirement workshop item | MEDIUM need / LOW semantics | Audience, metrics, Hospital scope, clinical meaning, export formats, and freshness are not settled. |
| Notifications / Communication | No notification module or delivery provider; activation currently uses copy link/QR/assisted handoff | No defined notification product flow found; legacy settings contains support/reporting references but not a reliable delivery contract | `INTENTIONALLY_DEFERRED` | Workshop handoff | MEDIUM need / LOW channel semantics | Email, SMS, LINE/LIFF, and other channels remain delivery decisions, not core activation authority. |
| Patient Self-Service | Patient can activate/login to a bounded landing only; no Patient portal or self-edit flow | No Patient-facing route was found in the legacy `app/` tree | `OPEN_REQUIREMENT` | Requirement workshop item | MEDIUM need / LOW scope | The architecture recognizes possible `SELF` scope but does not accept a Patient UI, visibility, measurement, or editing contract yet. |
| OSM Geography / Village Coverage | OSM relationship intentionally proves Hospital association only; no geography scope policy | `app/admin/villages`, `app/api/import-locations`, coach/village-oriented legacy behavior | `OPEN_REQUIREMENT` | Requirement workshop item | MEDIUM need / LOW semantics | Village maintenance is evidence to discuss, not proof that geography grants Patient authority. |
| Clinical Data Amendment / Correction | Current Screening/Goal/Appointment/Follow-up/Baseline/Evidence slices are immutable or append-only and omit amendment workflows | Legacy direct Patient edit/delete and cleanup utilities | `OPEN_REQUIREMENT` | Requirement workshop item | HIGH need / LOW authority semantics | Customer must define who may correct what, whether amendment supersedes history, and how audit/provenance work. |
| Patient Knowledge / Education Content | No rewrite knowledge/content module | `app/admin/knowledge` describes article/video/category management and is marked `กำลังพัฒนา` | `LOW_VALUE_FOR_DEMO` | Low priority | LOW | This may be useful later, but it is not needed to demonstrate the accepted onboarding-to-care chain and has no settled Patient delivery model. |
| Legacy Migration / Maintenance Utilities | No rewrite product flow for one-time address migration or legacy cleanup scripts | `address-migration`, `import-locations`, and related maintenance surfaces | `LEGACY_ONLY_MAINTENANCE` | Not a rewrite requirement | HIGH that the artifact is maintenance / LOW recurring need | Preserve as migration evidence only unless operational evidence proves recurrence. |

### 4.1 Coverage conclusion

The matrix shows broad semantic coverage of the current accepted workshop narrative. The `PARTIAL`, `MISSING_HIGH_CONFIDENCE`, and `OPEN_REQUIREMENT` rows are real residuals, but none is required to complete the five currently accepted golden journeys. The absence of Platform Admin routine clinical access, Patient self-service, recovery, reporting, and legacy destructive utilities is therefore not counted as a demo blocker.

## 5. Residual Gap Matrix

There are no `P13C-Bxx` rows because the Demo Blocker Gate is **NO**. The identifiers below are new to Phase 13C and are not reused from Phase 13A.

| ID | Residual category | Capability | Evidence | Gap | Impact | Confidence | Recommended treatment |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P13C-N01` | `MEANINGFUL_NON_BLOCKING` | Admin data quality, duplicate identity, and exception reconciliation | Legacy `app/admin/correct-data/page.tsx` identifies missing/inconsistent Patient identity/profile/HN data and exposes edit/delete operations; `app/admin/cleanup-goals/page.tsx` detects duplicate goal rows. The rewrite has no supported Admin repair route or mutation, while Patient import only classifies input conflicts. | The business responsibility is not represented as an operator workflow. Exact authority for correction, link/merge, deletion, historical repair, audit, and recovery is unresolved. | Meaningful operational risk and future support burden, but it is not needed to demonstrate onboarding-to-care on clean prepared data. | HIGH that the operational need exists; LOW that legacy action semantics are acceptable. | Hold a requirements/governance workshop for safe repair boundaries. If approved, implement a narrowly named, audited reconciliation slice; do not copy direct service-role delete/edit behavior. |
| `P13C-N02` | `MEANINGFUL_NON_BLOCKING` | Account recovery, including final/lost Owner recovery | Phase 12A/12C, `docs/CONTEXT.md`, and current login/activation routes explicitly leave recovery unresolved. No legacy flow provides trusted proof, delivery, reset, revocation, or final-Owner semantics. | There is no safe forgotten-password or account-control recovery journey. First-time activation is not a substitute. | A real production-operational gap, but the current workshop can use prepared active credentials and first-time activation. | HIGH need; LOW exact proof/channel/session semantics. | Keep deferred until proof of identity/control, delivery channel, credential reset, session revocation, and lost/final Owner authority are approved. Do not add a password-reset shortcut. |
| `P13C-R01` | `REQUIREMENT_WORKSHOP_ITEM` | OSM scope, geography, transfer, reassignment, and Patient Hospital affiliation | ADR-0008 explicitly says an OSM–Hospital relationship is not geography, assigned Patients, ownership, or clinical access. Current code implements exact assignment. Legacy villages/coach flows suggest additional operational concepts. | Customer semantics for area scope, OSM transfer/reassignment, and changing a Patient’s Hospital relationship are not settled. | The current assigned-Patient demo is coherent; future cross-Hospital/area operations cannot be safely designed by inference. | MEDIUM need; LOW exact semantics. | Ask the customer to define the authoritative relationship, cardinality, transfer history, authorization impact, and stale assignment behavior before implementation. |
| `P13C-R02` | `REQUIREMENT_WORKSHOP_ITEM` | Parent/child Hospital visibility and Owner governance beyond the current slice | ADR-0002/0008 and current policies reject hierarchy as automatic Patient authority. The rewrite supports exact direct memberships and Platform Admin governance only. | Business visibility, management, reporting, and cross-Hospital actions for parent/child organizations remain unspecified even though legacy navigation exposed hierarchy. | No blocker for an exact-Hospital workshop; the question matters before multi-Hospital management or reporting is built. | MEDIUM need; HIGH confidence that automatic Patient widening is not accepted. | Separate display/management visibility from Patient authorization and obtain explicit hierarchy semantics. |
| `P13C-R03` | `REQUIREMENT_WORKSHOP_ITEM` | Patient self-service, profile editability, measurement ownership, and field visibility | Patient landing is intentionally bounded; Profile is read-only; Baseline/clinical records are provisional and append-only. Phase 10/6 contracts leave field ownership, visibility, self-editability, and measurement semantics open. | No customer-approved Patient portal, self-edit, measurement owner, or field-level permission model exists. | Not required by current Journey D; implementing it now would invent Patient visibility and mutation authority. | MEDIUM need; LOW exact scope. | Use the workshop to decide whether Patient self-service exists, which fields are editable, who owns measurements, and how Hospital/OSM views differ. |
| `P13C-R04` | `REQUIREMENT_WORKSHOP_ITEM` | Clinical workflow ownership and permissions | ADR-0002 and current policies keep Doctor/Nurse as profession classifications. Current Goals/Appointment/Follow-up flows are provisional; no care-plan approval actor is modeled. | Doctor/Nurse permission differences, care-plan approval, appointment creator/responsible actor semantics, and clinical resource authority are unresolved. | Current demo can show a bounded operational flow without claiming final clinical governance. | HIGH that the decisions matter; LOW exact permissions. | Collect explicit actor/capability/scope decisions before introducing profession-sensitive or approval mutations. |
| `P13C-R05` | `REQUIREMENT_WORKSHOP_ITEM` | Clinical amendment/correction and artifact lifecycle | Current care records are immutable/append-only; Evidence supports create/list/view but not delete/replacement/retention. Legacy `correct-data`/cleanup actions are destructive and architecture-conflicting. | Correction, amendment, supersession, retention, deletion, and provenance rules are not defined. | Workshop can demonstrate creation/history; it cannot demonstrate a final correction process. This is not a blocker for the current prototype purpose. | HIGH need; LOW authority and lifecycle semantics. | Define who may amend which record, whether original values remain visible, how corrections are linked, and what audit metadata is permitted. |
| `P13C-R06` | `REQUIREMENT_WORKSHOP_ITEM` | Reporting, dashboard, and export scope | Legacy dashboard has counts/quick actions; legacy statistics describes Patient/Hospital/activity metrics and Excel/PDF export but is marked `กำลังพัฒนา`. Rewrite has no reporting module. | Audience, metrics, Hospital/role scope, clinical interpretation, export format, and data freshness are unknown. | No blocker for the operational journey; it may matter to management and support users. | MEDIUM need; LOW semantics. | Use workshop scenarios to identify consumers and decisions supported by each report before selecting data contracts or implementation. |
| `P13C-R07` | `REQUIREMENT_WORKSHOP_ITEM` | Hospital signup verification evidence and activation delivery channel | Current onboarding verifies against canonical Hospital master and performs manual Admin approval; no document/evidence workflow is present. ADR-0008 allows copy link/QR/assisted activation but leaves Email/SMS/LINE delivery as future decisions. | Required proof for Hospital application, who reviews it, how it is stored, and how activation is delivered are open. | Current demo can use a prepared application and copy link/QR; production onboarding cannot be finalized without the decisions. | HIGH need for trust; LOW evidence/channel semantics. | Decide the minimum verification evidence, retention/audit needs, and delivery channel(s) independently from the core activation capability. |
| `P13C-R08` | `REQUIREMENT_WORKSHOP_ITEM` | Hospital suspension consequences and communication | Rewrite deliberately implements status-only suspension with blocked operational scope and no cascade. Phase 13B.0 records no appeal, reason, notification, or session revocation semantics. | Customer has not defined whether suspension blocks existing sessions, how appeals/reasons/notifications work, or how related operations are reconciled. | The current suspension demo is coherent and fail-closed; it does not claim a full lifecycle policy. | MEDIUM need; LOW semantics. | Confirm lifecycle and communication consequences before changing the bounded no-cascade behavior. |
| `P13C-L01` | `NOT_A_REWRITE_REQUIREMENT` | Legacy address migration and location import | `app/admin/address-migration/page.tsx` explicitly says it is checking migration from `address_line1` into structured fields; `app/api/import-locations/route.ts` imports location data. | No evidence in the audited sources establishes this as a recurring customer workflow after migration completion. | None for the current workshop. | HIGH that the observed artifact is maintenance; LOW recurring product need. | Keep as migration/runbook evidence. Reopen only with evidence of ongoing operational use. |
| `P13C-L02` | `NOT_A_REWRITE_REQUIREMENT` | Legacy auth, hierarchy, and destructive workaround parity | Legacy localStorage role checks, first-role selection, broad hierarchy filtering, direct service-role edits/deletes, and birth-date/predictable passwords conflict with accepted server authority and target-owned activation. | Reproducing these behaviors would weaken identity, authorization, privacy, and audit boundaries. | None; absence is intentional architecture compliance. | HIGH | Do not recreate for screen parity. If a business need remains, restate it as a new scoped requirement under Person/User and Role/Capability/Scope rules. |
| `P13C-L03` | `LOW_PRIORITY` | Legacy knowledge content and incomplete utility/report surfaces | `app/admin/knowledge/page.tsx` and `app/admin/statistics/page.tsx` are visibly marked `กำลังพัฒนา`; no Patient portal/content delivery contract exists in the rewrite. | These surfaces are not complete enough to establish a current requirement and are not needed for the onboarding-to-care narrative. | Low current demo impact. | LOW | Leave out of Phase 14 unless the customer identifies a concrete workshop objective requiring it. |

## 6. Legacy Maintenance / Non-Parity Findings

The following distinctions are important to prevent uncontrolled feature accumulation:

### 6.1 `correct-data` is evidence of responsibility, not accepted destructive semantics

The legacy page and APIs provide strong evidence that somebody was expected to find and support problematic Patient data: missing Profile, incomplete names, missing HN, invalid identity format, duplicate identity numbers, and duplicate HN within a Hospital. That supports the `P13C-N01` business need.

The implementation uses service-role queries and direct edit/delete operations, including deleting User rows. The rewrite must not infer that an Admin may directly mutate or delete identity and clinical history. The safe rewrite question is who can open an exception, what correction/link/merge actions are valid, what is retained, and what audit/proof is required.

### 6.2 `cleanup-goals` is reconciliation evidence, not a delete requirement

The legacy utility groups duplicate `weekly_activity` rows by Patient/date/goal and deletes selected older records. It demonstrates historical data repair pressure. It does not establish that hard deletion is the correct business action, that the same duplicate definition applies to the rewrite’s immutable Goal/Follow-up model, or that the initiating actor should have that authority.

### 6.3 `address-migration` and location import are maintenance evidence

The address page explicitly describes migration from a legacy `address_line1` field into structured address fields. The location import API is similarly a data-loading utility. These are not current rewrite product capabilities without evidence that customers repeatedly perform them as part of normal operations.

### 6.4 Other rejected parity targets

- Legacy Admin local-storage role/Hospital checks and single-role assumptions are not an alternative authority model.
- Legacy parent/child Hospital filtering is not Patient authorization. The rewrite’s exact direct membership and exact OSM assignment boundaries are the evaluation boundary.
- Legacy temporary/emergency staff and ID-card flows may reflect real operational cases, but the audited code’s predictable passwords and temporary identity semantics do not define safe rewrite behavior. Their recurring business need remains separate from parity.
- Legacy dashboard/settings links, incomplete statistics, knowledge, and village management pages are evidence to discuss, not proof that every linked destination must be implemented next.
- Legacy direct Patient edit/delete/restore/permanent-delete controls conflate relationship lifecycle, account lifecycle, clinical retention, and hard deletion. They are intentionally not reproduced.

## 7. Demo Dataset / Workshop Prerequisites

No seed data or reset mechanism was added. The minimum recommended workshop state is:

### Core onboarding and workforce

- One active Platform `ADMIN` account.
- One canonical active Hospital master record.
- One pending Hospital application with applicant-owned credentials for the approval demonstration.
- One approved Hospital with an active Hospital Owner.
- One active Hospital Member, with a visible profession label if the workshop wants to discuss Doctor/Nurse semantics.
- One OSM with an active Hospital relationship and a separately prepared activation handoff.
- One second eligible Owner or promotable Member plus an ordinary Member for Owner promotion/demotion and final-Owner guard demonstrations.

### Patient care

- One newly provisioned Patient with a `PROVISIONED` account state for activation management.
- One activated Patient for the safe Patient landing demonstration.
- One Patient–Hospital relationship visible to the Hospital Owner/Member.
- One active OSM assignment to that exact Patient–Hospital relationship, so the OSM assigned directory can be shown.
- One completed Screening round.
- One Goal Plan with optional `screeningId` context.
- One active Appointment and one completed Appointment for lifecycle and Follow-up continuation.
- One Follow-up round, preferably linked to the completed Appointment and/or exact Goal Plan.
- One Baseline record.
- One Evidence artifact in the configured private storage bucket, with the server-only storage adapter working.

### Governance and lifecycle fixtures

- One suspended Hospital to show status-derived blocked operational scope and the absence of operational links.
- One OSM with no active assignment to demonstrate the suspend/restore path, plus one assigned OSM if the guard message is to be demonstrated.
- A second Owner fixture before showing demotion of the first Owner.
- A stale-write or concurrent-edit scenario is useful for technical review but is not required for the customer happy-path workshop.

### Reset and re-run concerns

The demonstrator should expect that:

- Activation credentials are one-time and are consumed after successful activation.
- A Hospital application moves through terminal approval/rejection states for the relevant scenario.
- Screening, Goal Plan, Follow-up, Baseline, and Evidence histories accumulate by design rather than being overwritten.
- Appointment terminal states such as completed, cancelled, or no-show affect which continuation is available.
- OSM relationship suspension is guarded by current assignments.

The practical workshop implication is to use disposable identities/relationships or a pre-staged isolated dataset for repeat runs. No reset system should be designed or implemented as part of this audit.

## 8. Workshop Readiness Assessment

### Discoverability

The actor-aware `/app` is now a useful starting point. It presents only policy-projected actions for the resolved actor and Hospital context. Admin governance/onboarding, Owner workforce, direct Hospital Patient work, OSM assigned Patients, and the bounded Patient landing are distinguishable. Patient Detail acts as the main care-workflow hub. The demonstrator still benefits from a short scenario card because not every care sub-route is a global navigation item and the approval/activation ceremonies cross users intentionally.

### Continuity

The meaningful chain no longer depends on repeated route guessing for its main transitions. Authoritative IDs are carried from provisioning to Patient Detail, Screening to Goals, Goal Plan to Follow-up, and completed Appointment to Follow-up. Remaining manual transitions are business-realistic or deliberate prototype boundaries: Admin applicant separate login, Owner-to-target activation handoff, Owner-to-OSM assignment handoff, and bulk import summary returning to the directory.

### Actor clarity

Actor context and active Hospital status are server-derived and shown in the application workspace. Hospital Owner, ordinary Hospital Member, OSM, Platform Admin, and Patient paths are separated by policy rather than by a client-supplied role. The workshop facilitator should still state the actor and Hospital before each handoff, especially when demonstrating a target account after activation or a User with multiple Hospital relationships.

### Prototype labeling

Screening, Goals, Appointment, Follow-up, Baseline, and Evidence surfaces communicate bounded/provisional behavior in the current implementation. They should be presented as requirement-validation behavior, not final clinical policy. The missing Patient portal, recovery, reporting, and reconciliation flows should be named as open or deferred in the workshop rather than presented as accidental omissions.

## 9. Open Requirement Questions

The following questions remain open because the current repository either explicitly defers them or only provides legacy evidence without safe semantics. They must not be silently resolved by implementing the most obvious legacy behavior.

| Question | Current evidence/status |
| --- | --- |
| What is the OSM scope: Hospital association only, geography, village/area, assigned Patients, or a combination? | Current accepted implementation uses exact Patient assignment for Patient access. ADR-0008 explicitly does not define geography or care scope. |
| Does parent/child Hospital metadata affect visibility, management, reporting, or only display? | It does not widen Patient authorization today. Broader organizational semantics remain open. |
| Are there additional Owner rules for creating, editing, assigning, or managing Appointments? | Current Appointment policy is provisional direct Hospital Owner/Member management and assigned OSM read; final clinical/operational actor rules are not approved. |
| Must Doctor and Nurse have different capabilities or fields? | They are currently profession classifications, not top-level roles or independent authority. |
| Who approves a care plan or Goal Plan, if approval exists? | Current Goals are explicit prototype records with no approval actor or clinical recommendation. |
| May a Patient edit profile fields or clinical measurements? Which fields and under which Hospital context? | Patient self-service, field ownership, visibility, and measurement ownership remain unresolved. |
| Who owns or is responsible for a measurement, Appointment, Follow-up, and care activity? | Current records retain bounded creator/responsible information under provisional rules; customer semantics are not final. |
| Can an OSM transfer or be reassigned between Hospitals/Patients, and what happens to active assignments and history? | Current OSM lifecycle blocks suspension with assignments and does not implement transfer/reassignment. |
| Can a Patient change Hospital affiliation, and is the relationship closed, transferred, or duplicated? | Current relationship is Hospital-specific and no transfer/change operation exists. |
| What evidence must accompany Hospital signup and who verifies it? | Current flow matches a canonical Hospital master and uses manual Admin approval; document/evidence requirements are not modeled. |
| Which activation delivery channels are accepted? | Core activation is channel-independent and currently demonstrable by copy link/QR/assisted handoff. Email, SMS, LINE/LIFF, and other channels remain future delivery decisions. |
| How are clinical data corrections/amendments represented? | Current care records are immutable/append-only or create/list/view only; original-vs-corrected history, authority, retention, and audit semantics are open. |
| What is the reporting scope and target audience? | Legacy dashboard/statistics evidence suggests an operational/management need, but metrics, exports, freshness, and Hospital scope are not defined. |
| What proof of identity/control is required for account recovery? Which delivery channel, credential reset, session revocation, provider semantics, or future ThaID/IAM role apply? | Account recovery remains intentionally unresolved. Existing activation must not be reused as recovery. |
| How is a lost or final Hospital Owner recovered without impersonation or an unsafe global reset? | Final-Owner recovery is explicitly open. |
| What authority does Admin have for duplicate identity resolution, reconciliation, exception repair, merge/link, correction, or deletion? | Legacy `correct-data` and `cleanup-goals` prove operational pressure but not safe rewrite authority. |

## 10. Demo Blocker Gate

### Are there any current `DEMO_BLOCKER` findings?

**NO.**

No `P13C-Bxx` item is recorded. The current implementation provides a coherent route/service/policy path for each accepted golden journey. The remaining friction is either:

- an intentional separate-actor or activation handoff;
- a bounded prototype stop that is explicitly accepted, such as the Patient account-ready landing;
- a workshop prerequisite such as prepared data or private storage configuration; or
- an unresolved requirement that should not be guessed.

This answer does not claim that the rewrite has all legacy functionality. It claims that the missing legacy and open-requirement domains do not prevent the intended onboarding-to-care customer workshop when the dataset is prepared.

## 11. Phase 14 Recommendation

### Recommended direction: Recommendation C — Requirements First

The next decision should be driven by customer clarification rather than another broad implementation slice. The prototype is now useful precisely because it exposes the boundaries where customer semantics matter: Patient self-service, OSM scope, Hospital hierarchy, clinical ownership, correction/amendment, reporting, activation delivery, signup evidence, reconciliation authority, and recovery.

### Why

- There is no current business-flow blocker in Journeys A–E.
- The highest-risk residuals are not missing screens; they are authorization, identity, privacy, lifecycle, audit, and clinical semantics.
- Implementing recovery, Admin repair, Patient editing, OSM geography, reporting, or clinical approval without customer decisions would create new business rules and could undermine the accepted architecture.
- The legacy maintenance and destructive utilities provide useful questions but do not provide safe rewrite semantics.

### What should not be included in the next implementation slice

- No speculative account-recovery/password-reset workflow.
- No direct-copy `correct-data` edit/delete/merge behavior.
- No Patient portal or self-editing based only on the conceptual `SELF` scope.
- No geography, parent/child, transfer, or Hospital-affiliation authority inferred from legacy filters.
- No Doctor/Nurse permission split or care-plan approval actor without explicit decisions.
- No reporting/export platform, notification provider integration, or knowledge CMS merely for legacy page parity.
- No address migration or other one-time maintenance utility as a rewrite product requirement.
- No Prisma schema, migration, seed, route, service, policy, component, or test changes under Phase 13C.

### Evidence that would change this recommendation

Move to a bounded missing-flow implementation only if a customer-approved requirement demonstrates that one of the current golden journeys cannot complete, or if a newly accepted business rule creates a concrete blocker in the workshop. A separate operational governance/reconciliation slice would become appropriate only after the authority, allowed repair actions, audit, and data-retention boundary for `P13C-N01` are explicitly defined. A demo-readiness slice could follow if the workshop proves that repeatable dataset/reset preparation, rather than product semantics, is the remaining material constraint.

## 12. Verification

- Inspected rewrite HEAD: `c3054107fa066000120906855b6078bb4308ce2e`.
- Inspected local legacy checkout and local Git metadata: `7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e`; no local content/metadata discrepancy observed.
- Inspected the required context, architecture baseline, ADR index, Phase 13A, Phase 13B.0, relevant `app/`, `src/modules/`, `tests/`, and `prisma/schema.prisma` evidence.
- `git status --short` was clean before the documentation change.
- Markdown links in this document were checked against the repository-relative files and route paths after writing.
- `P13C-*` identifiers were checked for uniqueness; no `P13C-Bxx` identifier exists because the blocker gate is `NO`.
- Thai text was checked for replacement characters/mojibake and the document was written as UTF-8 without BOM.
- `npm run lint`, `npm run typecheck`, and `npm test`: **Not run — Phase 13C is documentation-only.**
- No product code, Prisma schema, migration, route, service, policy, component, test, seed data, or UI behavior was changed by this phase.
