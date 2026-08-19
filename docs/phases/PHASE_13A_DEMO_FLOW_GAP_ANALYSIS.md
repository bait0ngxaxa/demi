# Phase 13A — End-to-End Demo Flow and Legacy Business-Flow Gap Analysis

Status: analysis/documentation-only. No application behavior, Prisma schema, migration, or architecture ADR is changed by this phase.

Inspection date: 2026-08-19.

## Executive conclusion

The rewrite already contains executable prototype paths for the accepted core business slices: Platform Admin bootstrap and Hospital onboarding, Hospital Owner workforce provisioning and activation, Patient provisioning and activation, Hospital/OSM Patient access and assignment, Screening, Goals / Activity Plan, Appointments, Follow-up, Patient Profile, Baseline, relationship-level status evidence, Hospital lifecycle, workforce membership lifecycle, OSM relationship lifecycle, and Hospital Owner governance.

The broad demo is not presently blocked by a missing clinical model or a missing persistence primitive. It is weakened by a small number of cross-module handoff gaps:

1. `/app` is a generic account landing page. It confirms role badges but does not give an actor-specific next step or selected-Hospital continuation path.
2. Patient provisioning returns an authoritative `relationshipId` from the application service, but the success UI does not link to that Patient Detail route. A demonstrator must leave the form and search the directory again.
3. Provisioning, activation, and onboarding handoffs intentionally require a second actor or a manual one-time-link presentation, but the UI does not explain the next context as clearly as it could.
4. The Patient Detail page is a useful hub, but Screening detail has no direct Goal entry point and Goal detail has no direct Follow-up entry point. The demonstrator can still navigate through the hub and selectors.
5. Hospital suspension and restoration work server-side and fail closed, but the affected Hospital workspace does not present a clear status-aware continuation message.

No confirmed `P13-BLOCKER` was found for the accepted onboarding-to-care golden demo. The accepted operational flows have application paths. The missing Patient-facing data journey and all account-recovery behavior remain `REQUIREMENT_UNRESOLVED` / deferred, not silently incomplete implementation work.

This is a conclusion about the golden demo, not a conclusion that no meaningful legacy business-flow gaps remain. The legacy review also found residual Admin operational domains—especially data-quality review, duplicate-identity/data reconciliation, and exceptional-support repair—that are not represented as current rewrite workflows. They remain tracked as later requirements; their exact correction, merge, deletion, authority, audit, and recovery semantics are not decided here.

The smallest useful Phase 13B.0 is therefore navigation and orchestration closure around existing services and projections. It should not add a workflow engine, a reporting platform, a recovery policy, or new clinical behavior.

## 1. Evidence and review method

### Current rewrite sources

The current baseline was checked against:

- [Project context](../CONTEXT.md), including the Phase 11B.0, 11D.0, 12B.0, and 12D.0 handoffs and the explicit recovery boundary.
- [Architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md) and [accepted ADR index](../adr/README.md).
- Phase contracts and handoffs for [Hospital onboarding](PHASE_3A_HOSPITAL_ONBOARDING.md), [Platform Admin bootstrap](PHASE_3C_PLATFORM_ADMIN_BOOTSTRAP.md), [workforce](PHASE_4A_WORKFORCE_PROVISIONING.md), [workforce implementation](PHASE_4B_WORKFORCE_PROVISIONING.md), [Patient provisioning](PHASE_5B1_PATIENT_PROVISIONING_CORE.md), [Patient activation](PHASE_5B2_PATIENT_FIRST_TIME_ACTIVATION.md), [Patient directory](PHASE_6B1_PATIENT_DIRECTORY.md), [OSM assignment](PHASE_6B2_PATIENT_OSM_ASSIGNMENT.md), [Screening](PHASE_7B0_SCREENING_WORKING_PROTOTYPE.md), [Goals](PHASE_8B0_GOALS_AND_ACTIVITY_PLAN_WORKING_PROTOTYPE.md), [Appointments](PHASE_9B0_APPOINTMENT_WORKING_PROTOTYPE.md), [Follow-up](PHASE_9C0_FOLLOWUP_PROGRESS_WORKING_PROTOTYPE.md), [Patient Profile](PHASE_10B0_PATIENT_PROFILE_WORKING_PROTOTYPE.md), [Baseline](PHASE_10C0_BASELINE_INITIAL_STATE_WORKING_PROTOTYPE.md), [status evidence](PHASE_10D0_PATIENT_STATUS_ARTIFACTS_WORKING_PROTOTYPE.md), [staff membership lifecycle](PHASE_11B0_STAFF_MEMBERSHIP_LIFECYCLE_WORKING_PROTOTYPE.md), [OSM relationship lifecycle](PHASE_11D0_OSM_RELATIONSHIP_LIFECYCLE_WORKING_PROTOTYPE.md), [Hospital lifecycle](PHASE_12B0_HOSPITAL_LIFECYCLE_WORKING_PROTOTYPE.md), and [Hospital Owner governance](PHASE_12D0_HOSPITAL_OWNER_GOVERNANCE_WORKING_PROTOTYPE.md).
- [Prisma schema](../../prisma/schema.prisma), current `app/` routes, `src/modules/`, server actions, policies, application services, and focused tests.
- [Application navigation](../../src/components/app-shell/application-navigation.ts), [actor landing page](../../app/app/page.tsx), and the relationship-scoped [Patient Detail hub](<../../app/app/patients/[relationshipId]/page.tsx>).

The current test inventory contains focused unit/transport tests and PostgreSQL integration tests for the individual modules. It does not contain a browser-level test that executes one complete golden journey across all of these modules. That distinction is important: a passing service test proves an application path exists, but not that a demonstrator can discover the next path from the preceding screen.

### Legacy source

The legacy behavior review used the local checkout at:

```text
C:\Users\Bait0ng\Desktop\legacy-demi\demi-plus-web-v2
```

The checkout is pinned to legacy commit `7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e`. The [legacy repository at that commit](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e) was inspected as behavioral and terminology evidence only. Legacy authentication, authorization, direct-browser database access, hierarchy authority, credential handling, and data-model choices are not rewrite requirements.

The `correct-data`, `address-migration`, and `cleanup-goals` utilities below were inspected directly from that local checkout. The remote commit link is supporting context; the local checkout remains the primary legacy inspection source for this phase.

Evidence labels used below:

- **Direct current evidence** — a reachable route, service, policy, test, or schema relation was inspected.
- **Legacy evidence** — a user-visible legacy route or query was inspected.
- **Contract** — an accepted rewrite contract or a deliberately recorded open requirement.
- **Inference** — a demo consequence inferred from the direct evidence; it is not a new product requirement.

## 2. Current DEMI flow inventory

The maturity labels are deliberately conservative. A Prisma model, enum, or service function without a reachable application path is not treated as a working flow.

### ADMIN

| Flow | Entry point / initiator | Application service or module | Result and currently reachable downstream flow | Maturity | Evidence |
|---|---|---|---|---|---|
| First Platform Admin bootstrap | Trusted operator runs `npm run admin:bootstrap` | `platform-admin-bootstrap` | Creates the first `Person`/`User`, provider identity, `Role.ADMIN`, and active account under the trusted bootstrap contract; Admin then uses `/login`. | **Working Prototype** | [Phase 3C](PHASE_3C_PLATFORM_ADMIN_BOOTSTRAP.md), [bootstrap script](../../scripts/admin-bootstrap.mjs), [README bootstrap instructions](../../README.md) |
| Admin authentication and session resolution | Admin uses `/login` | Auth provider adapter, `authentication-service`, `actor-context-service` | Provider subject maps server-side to an active DEMI `User`; `ActorContext` derives roles and governance scope; `/app` is reachable. | **Working Prototype** | [Login page](../../app/login/page.tsx), [actor context](../../src/modules/auth/services/actor-context-service.ts), [application access](../../src/modules/auth/services/application-access-service.ts) |
| Review Hospital onboarding application | `/app/admin/hospital-onboarding` and application detail; initiating actor is `Role.ADMIN` | `hospital-onboarding` policy, server actions, and service | Admin can approve or reject. Approval atomically produces an active Hospital, active applicant account, `Role.HOSPITAL`, and exact active `OWNER` membership. The applicant can then log in separately. | **Working Prototype** | [Admin onboarding routes](../../app/app/admin/hospital-onboarding), [review actions](<../../app/app/admin/hospital-onboarding/[id]/review-actions.tsx>), [service actions](../../src/modules/hospital-onboarding/transport/server-actions.ts), [Phase 3A](PHASE_3A_HOSPITAL_ONBOARDING.md) |
| Hospital governance | `/app/admin/hospitals` and Hospital detail; initiating actor is Platform `ADMIN` | `hospital-governance` policy/service | Admin can perform bounded `ACTIVE ↔ SUSPENDED` status-only transitions with atomic audit. Lower-level User, membership, OSM, Patient, appointment, and clinical rows are not cascaded. | **Working Prototype** | [Hospital governance routes](../../app/app/admin/hospitals), [Phase 12B.0](PHASE_12B0_HOSPITAL_LIFECYCLE_WORKING_PROTOTYPE.md), [schema](../../prisma/schema.prisma) |
| Admin data-quality, duplicate-identity reconciliation, and exceptional-support repair | No supported current route or mutation | No rewrite repair/reconciliation service or operator exception queue. Identity reuse during provisioning is not a substitute for post-hoc correction, merge, conflict, deletion, or historical-record repair. | No current downstream flow; this residual operational domain is tracked as `P13-D7` and is outside the onboarding-to-care golden demo. | **Not Implemented** | [Application navigation](../../src/components/app-shell/application-navigation.ts), [Patient provisioning service](../../src/modules/patient-provisioning/services/patient-provisioning-service.ts), [architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md) |
| Routine Patient or clinical operations as Platform Admin | No supported routine route or policy scope | Deliberately denied by Patient and clinical policies | Admin governance does not open Hospital Patient directories, assigned Patient records, Screening, Goals, Appointments, or Follow-up merely because the actor is `ADMIN`. | **Not Implemented** | [Patient directory policy](../../src/modules/patient-directory/policies/patient-directory-policy.ts), [architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md) |
| Reporting and dashboard summary | `/app` only; no current reporting module | No reporting application service | The landing page shows account/role information and says no summary data is available. No accepted reporting flow is reachable. | **Not Implemented** | [Current landing page](../../app/app/page.tsx), [legacy dashboard evidence](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/dashboard/page.tsx) |
| Account recovery | No route or mutation; requirements are documented in Phase 12 | No recovery service; activation services are intentionally separate | Forgotten-password, recovery proof, assisted authority, provider reset, session revocation, and final-Owner recovery have no accepted behavior. | **Documentation/Contract Only** | [Phase 12A requirements](PHASE_12A_HOSPITAL_GOVERNANCE_ACCOUNT_RECOVERY_REQUIREMENTS.md), [Phase 12C contract](PHASE_12C_OWNER_GOVERNANCE_ACCOUNT_RECOVERY_CONTRACT.md), [current login](../../app/login/page.tsx) |

### HOSPITAL OWNER

`HOSPITAL OWNER` below means `Role.HOSPITAL` plus an exact active `HospitalMembership` with `membershipType = OWNER` in an active target Hospital. It is not the Platform `ADMIN` role.

| Flow | Entry point / initiator | Application service or module | Result and currently reachable downstream flow | Maturity | Evidence |
|---|---|---|---|---|---|
| Enter the approved Hospital workspace | Applicant follows approval result operationally, then uses `/login` → `/app` | Auth actor context and Hospital scope policies | The applicant is an active Hospital Owner. The navigation exposes workforce and direct-Hospital Patient capabilities. The first landing page is generic rather than workflow-oriented. | **Partial Prototype** | [Onboarding approval service](../../src/modules/hospital-onboarding/services/hospital-onboarding-service.ts), [navigation](../../src/components/app-shell/application-navigation.ts), [landing page](../../app/app/page.tsx) |
| Provision Hospital member | `/app/workforce`; initiating actor is active direct Owner | `workforce` service and policy | Creates or reuses `Person`/`User`, Hospital role/membership, and a provisioned account/relationship; existing active identity reuse is supported. The UI presents an activation link/QR where required. | **Working Prototype** | [Workforce page](../../app/app/workforce/page.tsx), [workspace](../../app/app/workforce/workforce-workspace.tsx), [Phase 4B](PHASE_4B_WORKFORCE_PROVISIONING.md) |
| Provision OSM | `/app/workforce`; initiating actor is active direct Owner | `workforce` service and OSM relationship policy | Creates or reuses the OSM identity and exact Hospital relationship, initially provisioned where activation is needed. Downstream OSM activation and Patient assignment are available. | **Working Prototype** | [Workforce workspace](../../app/app/workforce/workforce-workspace.tsx), [Phase 4B](PHASE_4B_WORKFORCE_PROVISIONING.md) |
| Workforce activation handoff | Owner presents `/activate/workforce` link, QR, or explicit assisted link to target user | `workforce` activation service and auth provider adapter | Target user establishes their own password; User and relationship become active; target can log in. Activation is first-time establishment, not recovery. | **Working Prototype** | [Workforce activation route](../../app/activate/workforce/page.tsx), [activation handoff](../../src/modules/workforce/services/activation-token-service.ts), [Phase 4B](PHASE_4B_WORKFORCE_PROVISIONING.md) |
| Staff membership lifecycle | Workforce row/detail `/app/workforce/staff/[relationshipId]`; Owner initiates | `workforce` membership lifecycle service | Owner can update provisional profession and suspend/restore an ordinary active member with bounded audit and no User/account cascade. | **Working Prototype** | [Staff detail route](<../../app/app/workforce/[kind]/[relationshipId]/page.tsx>), [Phase 11B.0](PHASE_11B0_STAFF_MEMBERSHIP_LIFECYCLE_WORKING_PROTOTYPE.md) |
| OSM relationship lifecycle | Workforce row/detail `/app/workforce/osm/[relationshipId]`; Owner initiates | OSM lifecycle service and policy | Owner can suspend/restore the exact OSM relationship when the exact Hospital has no current Patient assignment; blocked states explain the assignment guard. | **Working Prototype** | [OSM detail route](<../../app/app/workforce/[kind]/[relationshipId]/page.tsx>), [Phase 11D.0](PHASE_11D0_OSM_RELATIONSHIP_LIFECYCLE_WORKING_PROTOTYPE.md) |
| Hospital Owner governance | Staff detail route; Owner initiates promotion/demotion | `hospital-owner-governance` service and policy | `MEMBER ↔ OWNER` changes occur on the exact active Hospital membership, with serializable protection and a final eligible Owner guard. | **Working Prototype** | [Owner governance handoff](PHASE_12D0_HOSPITAL_OWNER_GOVERNANCE_WORKING_PROTOTYPE.md), [workforce detail route](<../../app/app/workforce/[kind]/[relationshipId]/page.tsx>) |
| Provision/import Patient | `/app/patients/provision`; active direct Hospital Owner may initiate | `patient-provisioning` service/policy | Creates or reuses Person/User, `PATIENT` role, Patient Profile, and exact `PatientHospitalRelationship`; identity reuse and Excel preview/import are supported. Result currently leads to activation management only, not directly to the new Patient Detail. | **Working Prototype** | [Provisioning page](../../app/app/patients/provision/page.tsx), [workspace result](../../app/app/patients/provision/patient-provisioning-workspace.tsx), [service result](../../src/modules/patient-provisioning/services/patient-provisioning-service.ts), [Phase 5B.1](PHASE_5B1_PATIENT_PROVISIONING_CORE.md) |
| Issue Patient first-time activation | `/app/patients/activation`; direct Hospital Owner may initiate | `patient-activation` service/policy | Owner searches by exact National ID/HN in Hospital scope and presents a purpose-specific one-time link/QR. Patient can claim it and establish a first credential. | **Working Prototype** | [Activation page](../../app/app/patients/activation/page.tsx), [activation workspace](../../app/app/patients/activation/patient-activation-actions-workspace.tsx), [Phase 5B.2](PHASE_5B2_PATIENT_FIRST_TIME_ACTIVATION.md) |
| Patient directory and detail | `/app/patients` → `/app/patients/[relationshipId]` | `patient-directory` query/policy | Owner can search the exact Hospital relationship, open the read-only profile/detail projection, and reach Baseline, Evidence, assignment, Screening, Goals, Appointments, and Follow-up routes. | **Working Prototype** | [Directory page](../../app/app/patients/page.tsx), [Patient Detail](<../../app/app/patients/[relationshipId]/page.tsx>), [Phase 6B.1](PHASE_6B1_PATIENT_DIRECTORY.md) |
| Assign OSM to Patient | Patient Detail → `/assignment`; Owner initiates | `patient-assignment` service/policy | Owner assigns or unassigns an active OSM relationship for the exact Patient-Hospital relationship. OSM can then find the Patient through `/app/patients/assigned`. | **Working Prototype** | [Assignment page](<../../app/app/patients/[relationshipId]/assignment/page.tsx>), [Phase 6B.2](PHASE_6B2_PATIENT_OSM_ASSIGNMENT.md) |
| Screening | Patient Detail → `/screenings` → `/new`; Owner may initiate for a directly readable Patient | `screening` service/policy | A versioned source-defined assessment is validated, scored provisionally, persisted historically, and displayed in detail/history. It does not create Goals automatically. | **Working Prototype** | [Screening routes](<../../app/app/patients/[relationshipId]/screenings>), [Phase 7B.0](PHASE_7B0_SCREENING_WORKING_PROTOTYPE.md) |
| Goals / Activity Plan | Patient Detail → `/goals` → `/new`; Owner may initiate | `goals` service/policy | An explicit Goal Plan is created and displayed historically; optional Screening context can be shown. No clinical recommendation, adherence, or automatic Screening side effect is added. | **Working Prototype** | [Goals routes](<../../app/app/patients/[relationshipId]/goals>), [Phase 8B.0](PHASE_8B0_GOALS_AND_ACTIVITY_PLAN_WORKING_PROTOTYPE.md) |
| Appointments and Follow-up | Patient Detail → `/appointments`; Owner can manage Appointment, then completed Appointment detail → Follow-up | `appointments` and `followups` services/policies | Appointment lifecycle is executable. A completed Appointment has a direct “บันทึก Follow-up” entry; Follow-up is an immutable round with optional explicit Appointment and Goal Plan context. | **Working Prototype** | [Appointment detail](<../../app/app/patients/[relationshipId]/appointments/[appointmentId]/page.tsx>), [Follow-up form](<../../app/app/patients/[relationshipId]/followups/new/page.tsx>), [Phase 9B.0](PHASE_9B0_APPOINTMENT_WORKING_PROTOTYPE.md), [Phase 9C.0](PHASE_9C0_FOLLOWUP_PROGRESS_WORKING_PROTOTYPE.md) |
| Profile, Baseline, and status evidence | Patient Detail → Profile/Baseline/Evidence cards | `patient-directory`, `patient-baseline`, `patient-evidence` services/policies | Owner can view the provisional read-only profile, create/read one immutable relationship Baseline, and upload/list/view relationship-level image evidence when private storage is configured. | **Working Prototype** | [Patient Detail](<../../app/app/patients/[relationshipId]/page.tsx>), [Phase 10B.0](PHASE_10B0_PATIENT_PROFILE_WORKING_PROTOTYPE.md), [Phase 10C.0](PHASE_10C0_BASELINE_INITIAL_STATE_WORKING_PROTOTYPE.md), [Phase 10D.0](PHASE_10D0_PATIENT_STATUS_ARTIFACTS_WORKING_PROTOTYPE.md) |

### HOSPITAL MEMBER

| Flow | Entry point / initiator | Application service or module | Result and currently reachable downstream flow | Maturity | Evidence |
|---|---|---|---|---|---|
| Enter a direct Hospital workspace | `/login` → `/app`; active direct Hospital member | Auth actor context and direct Hospital policies | Member receives only the capabilities granted by the active exact membership. Workforce administration and Owner governance are not opened by ordinary membership. | **Working Prototype** | [Actor context](../../src/modules/auth/services/actor-context-service.ts), [workforce policy](../../src/modules/workforce/policies/workforce-policy.ts), [Phase 4B](PHASE_4B_WORKFORCE_PROVISIONING.md) |
| Read Patient directory/detail | Navigation `/app/patients` → Patient Detail; active Hospital member | `patient-directory` service/policy | Member can read the direct active Hospital relationship and reach the relationship-scoped clinical prototype routes allowed by the relevant policies. | **Working Prototype** | [Navigation](../../src/components/app-shell/application-navigation.ts), [directory policy](../../src/modules/patient-directory/policies/patient-directory-policy.ts), [Phase 6B.1](PHASE_6B1_PATIENT_DIRECTORY.md) |
| Provision Patient and issue Patient activation | `/app/patients/provision` and `/app/patients/activation`; active direct Hospital member | `patient-provisioning` and `patient-activation` services | Direct `OWNER` and `MEMBER` Hospital memberships are supported for these Hospital-scoped operations. The same post-provisioning detail-link gap applies to a member. | **Working Prototype** | [Provisioning policy](../../src/modules/patient-provisioning/policies/patient-provisioning-policy.ts), [activation policy](../../src/modules/patient-activation/policies/patient-activation-policy.ts), [Phase 5B.1](PHASE_5B1_PATIENT_PROVISIONING_CORE.md) |
| Record Patient care artifacts | Patient Detail links to Screening, Goals, Appointments, Follow-up, Baseline, and Evidence | Module-specific relationship-scoped policies/services | Member can reach the supported direct-Hospital operations; server policy remains the authority and the same relationship ID is used across modules. | **Working Prototype** | [Patient Detail](<../../app/app/patients/[relationshipId]/page.tsx>), [Screening policy](../../src/modules/screening/policies/screening-policy.ts), [Goal policy](../../src/modules/goals/policies/goal-policy.ts), [Follow-up policy](../../src/modules/followups/policies/followup-policy.ts) |

### OSM

| Flow | Entry point / initiator | Application service or module | Result and currently reachable downstream flow | Maturity | Evidence |
|---|---|---|---|---|---|
| OSM first-time activation and login | Owner presents `/activate/workforce`; OSM target claims it, then uses `/login` | Workforce activation and auth services | OSM account and exact Hospital relationship become active; ActorContext exposes the active OSM-Hospital relationship. | **Working Prototype** | [Workforce activation](../../app/activate/workforce/page.tsx), [Phase 4B](PHASE_4B_WORKFORCE_PROVISIONING.md) |
| OSM assigned Patient directory | `/app/patients/assigned`; active OSM initiates | `patient-directory` assigned query/policy | OSM sees only current assignments in an active exact Hospital and opens the same relationship-scoped Patient Detail route. | **Working Prototype** | [Assigned Patient page](../../app/app/patients/assigned/page.tsx), [directory query service](../../src/modules/patient-directory/services/patient-directory-query-service.ts), [Phase 6B.2](PHASE_6B2_PATIENT_OSM_ASSIGNMENT.md) |
| Provision a Patient in OSM scope | `/app/patients/provision`; active OSM relationship initiates | `patient-provisioning` service/policy | The current policy permits active OSM-Hospital scope to provision a Patient. OSM cannot use the Hospital-only Patient activation issuance capability. | **Working Prototype** | [Provisioning policy](../../src/modules/patient-provisioning/policies/patient-provisioning-policy.ts), [activation policy](../../src/modules/patient-activation/policies/patient-activation-policy.ts) |
| Record care artifacts for assigned Patient | Patient Detail → Screening, Goals, Appointments/Follow-up, Baseline/Evidence as allowed | Relationship-scoped module services/policies | Assigned OSM can execute the current prototype care-record operations within exact assignment/Hospital checks; Appointment authority is narrower than direct Hospital management. | **Working Prototype** | [Screening policy](../../src/modules/screening/policies/screening-policy.ts), [Goal policy](../../src/modules/goals/policies/goal-policy.ts), [Appointment policy](../../src/modules/appointments/policies/appointment-policy.ts), [Follow-up policy](../../src/modules/followups/policies/followup-policy.ts) |
| OSM relationship lifecycle | Owner uses `/app/workforce/osm/[relationshipId]`; OSM is the target, not the initiator | OSM lifecycle service | Owner can suspend/restore only under the current assignment-count guard. OSM cannot self-manage this relationship lifecycle. | **Working Prototype** | [Phase 11D.0](PHASE_11D0_OSM_RELATIONSHIP_LIFECYCLE_WORKING_PROTOTYPE.md), [workforce detail](<../../app/app/workforce/[kind]/[relationshipId]/page.tsx>) |

### PATIENT

| Flow | Entry point / initiator | Application service or module | Result and currently reachable downstream flow | Maturity | Evidence |
|---|---|---|---|---|---|
| First-time account activation | `/activate/patient`; provisioned Patient initiates with a one-time credential issued by a direct Hospital actor | `patient-activation` service and provider adapter | Patient establishes a first password; `User` becomes active and can authenticate at `/login`. | **Working Prototype** | [Patient activation route](../../app/activate/patient/page.tsx), [Phase 5B.2](PHASE_5B2_PATIENT_FIRST_TIME_ACTIVATION.md) |
| Patient login/session | `/login`; active Patient initiates | Auth provider and ActorContext | Active Patient identity is resolved server-side and can reach `/app`. | **Partial Prototype** | [Login page](../../app/login/page.tsx), [actor context](../../src/modules/auth/services/actor-context-service.ts) |
| Patient-facing workspace/data access | No Patient navigation item or Patient-facing data route is implemented under `/app` | No accepted Patient self-service/read service | `/app` is a generic role/account page. The rewrite does not yet decide which profile, Screening, Goals, Appointment, Follow-up, or status data a Patient may view or edit. | **Not Implemented** | [Application navigation](../../src/components/app-shell/application-navigation.ts), [current landing page](../../app/app/page.tsx), [Phase 10A requirements](PHASE_10A_PATIENT_PROFILE_BASELINE_STATUS_REQUIREMENTS.md), [architecture open requirements](../architecture/DEMI_ARCHITECTURE_BASELINE.md) |

## 3. Legacy business-flow inventory and classification

The legacy application is useful evidence that operators expected a connected staff workflow. It is not evidence that the legacy authorization, data ownership, or clinical rules should be copied.

| Legacy user-visible behavior | Legacy evidence | Rewrite classification | Current interpretation |
|---|---|---|---|
| Staff login and staff role gate for `admin`, `doctor`, `helper`, and `osm` | [Legacy Admin login](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/login/page.tsx) | `COVERED_DIFFERENTLY_BY_REDESIGN` | Rewrite authentication is provider-backed, server-resolved, and role/scope-aware. The legacy `localStorage` session and browser authority are intentionally not copied. |
| Staff dashboard with Patient, Screening, Goals, Appointment, staff, report, and settings entry points plus counts/quick actions | [Legacy dashboard](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/dashboard/page.tsx) | `PARTIALLY_COVERED` | Current routes cover the substantive operational modules, but `/app` has no equivalent next-step launcher or summary counts. Full analytics are not required for the current demo. |
| Hospital list, create/edit, and parent/sub-hospital hierarchy | [Legacy Hospital routes](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/hospitals) and [legacy queries](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | `COVERED_DIFFERENTLY_BY_REDESIGN` | Rewrite uses canonical Hospital Master onboarding plus bounded Platform Admin lifecycle governance. Parent metadata is not implicit authorization. |
| Parent/child hierarchy as a broad access mechanism | Legacy dashboard and `getAccessibleHospitalIds` behavior | `INTENTIONALLY_REJECTED_LEGACY_BEHAVIOR` | Accepted rewrite policy requires exact direct Hospital membership or exact OSM relationship. No Phase 13 work should restore hierarchy authority. |
| Admin/staff self-registration, direct staff creation, temporary staff, emergency registration, temporary-ID conversion, and ID-card assignment | [Legacy staff routes](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff) | `PARTIALLY_COVERED` | Standard workforce provisioning and first-time activation cover the accepted prototype journey. Temporary/emergency identity reconciliation and geographic/ID-card policy remain open; the legacy browser mutations are not copied. |
| Staff deactivate/restore/permanent delete and predictable password reset | [Legacy staff queries](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) and [Phase 12A analysis](PHASE_12A_HOSPITAL_GOVERNANCE_ACCOUNT_RECOVERY_REQUIREMENTS.md) | `INTENTIONALLY_REJECTED_LEGACY_BEHAVIOR` | Rewrite has bounded membership/relationship lifecycle slices. User account suspension, deletion, password recovery, credential replacement, and retention semantics are separate unresolved domains. |
| Patient directory, search, pagination, registration/import/demo creation | [Legacy Patient list](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients) and [legacy queries](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | `COVERED_DIFFERENTLY_BY_REDESIGN` | Rewrite provides direct-Hospital and assigned-OSM directory boundaries, identity reuse, single provisioning, and bounded Excel import. Demo-patient shortcuts are not needed. |
| Admin data-quality exception review and manual correction (`correct-data`) | Local: `C:\Users\Bait0ng\Desktop\legacy-demi\demi-plus-web-v2\app\admin\correct-data\page.tsx`; related legacy endpoints `app/api/admin/get-problems`, `update-patient`, and `delete-problems`; [supporting commit view](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/correct-data/page.tsx) | `MISSING_HIGH_CONFIDENCE` | The screen finds missing Profile, incomplete name, missing HN, duplicate identity, invalid identity format, and duplicate HN within a Hospital, then lets an operator inspect, manually correct, and in some cases delete records. This is direct evidence of an operational data-quality/reconciliation need in the legacy business, not evidence that the rewrite should copy the screen. Safe repair authority, identity reconciliation/merge, deletion, conflict handling, audit, and relationship consequences remain `OPEN_REQUIREMENT` / deferred. |
| Historical duplicate-Goal cleanup (`cleanup-goals`) | Local: `C:\Users\Bait0ng\Desktop\legacy-demi\demi-plus-web-v2\app\admin\cleanup-goals\page.tsx`; [supporting commit view](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/cleanup-goals/page.tsx) | `MISSING_HIGH_CONFIDENCE` | The operator searches a Patient or all Patients, groups legacy `weekly_activity` Goal rows by Patient/date/name, keeps the newest row, and offers deletion of the remaining duplicates. This belongs to the broader data-reconciliation/exception-support family rather than the normal Goal workflow. The rewrite must not recreate direct destructive deletion; safe repair semantics and historical-record policy remain open. |
| Address field migration (`address-migration`) | Local: `C:\Users\Bait0ng\Desktop\legacy-demi\demi-plus-web-v2\app\admin\address-migration\page.tsx`; [supporting commit view](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/address-migration/page.tsx) | `LOW_VALUE_FOR_CURRENT_DEMO` | The screen selects a Patient, reads legacy `address_line1`, and manually saves structured address fields while retaining the old value for reference. The wording and behavior identify a one-off historical migration/maintenance utility, not a reusable onboarding-to-care business workflow. Do not promote it into the rewrite without a separately accepted address-data requirement. |
| Patient detail hub with edit, Baseline, Screening, Screening history, Goals, Appointments, Follow-up history, and status tracking | [Legacy Patient detail](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients) | `COVERED_BY_CURRENT_REWRITE` | The rewrite's relationship-scoped Patient Detail hub reaches the corresponding prototype artifacts, with stronger server-side boundaries and clearer separation of domains. |
| Patient profile editing and legacy health-field correction | [Legacy Patient edit/detail routes](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients) | `PARTIALLY_COVERED` | Current rewrite provides a provisional read-only profile projection. Field ownership, visibility, correction, and actor-specific editing remain open requirements. |
| Coach/OSM assignment and geographic village/volunteer assignment | [Legacy village routes](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/villages) and [legacy assignment queries](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | `COVERED_DIFFERENTLY_BY_REDESIGN` | Exact Hospital-scoped OSM relationship and Patient assignment are implemented. Geographic scope, transfer, reassignment, and volunteer-area semantics remain open. |
| Baseline / initial state | [Legacy Patient baseline route](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients) | `COVERED_DIFFERENTLY_BY_REDESIGN` | Rewrite uses a dedicated immutable relationship Baseline rather than treating legacy fields as a generic mutable Patient status. |
| Status tracking with image gallery/captions | [Phase 10D legacy evidence record](PHASE_10D0_PATIENT_STATUS_ARTIFACTS_WORKING_PROTOTYPE.md) and [legacy Patient routes](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients) | `COVERED_DIFFERENTLY_BY_REDESIGN` | Rewrite has relationship-level append-only evidence with private storage and short-lived access. Delete, replacement, retention, and final ownership remain open. |
| PAM/PROMs Screening, provisional score/level, history, and direct move toward Goals | [Legacy Screening route](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/screening/page.tsx) and [legacy `saveScreening`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | `COVERED_DIFFERENTLY_BY_REDESIGN` | Rewrite provides a source-defined versioned assessment, server validation/scoring, historical records, and a separate explicit Goal Plan. Legacy automatic side effects are not a confirmed requirement. |
| Automatic default Goals based on Screening/PAM level, Goal rounds, and activity recording | [Legacy Goal helpers](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | `INTENTIONALLY_REJECTED_LEGACY_BEHAVIOR` | Current rewrite deliberately does not auto-create Goals from Screening. Goal templates, clinical recommendations, targets, adherence, and correction semantics need customer confirmation. |
| Appointment list, create, edit, next appointment, patient context, and completed-appointment Follow-up action | [Legacy Appointment view](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/appointments/view/page.tsx), [legacy Appointment routes](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/appointments) | `COVERED_DIFFERENTLY_BY_REDESIGN` | Rewrite has relationship-scoped Appointment lifecycle and a working completed Appointment → Follow-up handoff. Timezone, creator/change authority, notifications, and operational scheduling policy remain provisional. |
| Follow-up measurements, progress, confidence, notes, and history | [Legacy Follow-up route](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/appointments) and [legacy follow-up queries](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | `COVERED_DIFFERENTLY_BY_REDESIGN` | Rewrite records immutable rounds with explicit optional Appointment/Goal provenance and no clinical conclusion or recommendation engine. |
| Dashboard reports/statistics and Excel/PDF export | [Legacy statistics page](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/statistics/page.tsx) | `LOW_VALUE_FOR_CURRENT_DEMO` | The legacy statistics page is explicitly marked “กำลังพัฒนา”; it does not establish a completed accepted reporting contract. Do not make production-scale reporting a Phase 13 closure dependency. |
| Knowledge/content and system settings hub | [Legacy settings route](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/settings/page.tsx) | `LOW_VALUE_FOR_CURRENT_DEMO` | These are peripheral to the requested onboarding-to-care demo and have no accepted rewrite requirement. |
| Patient login and patient self-service portal | Legacy Admin login explicitly gates to staff roles and the inspected legacy `app/` tree has no Patient-facing route | `OPEN_REQUIREMENT` | The rewrite's Patient activation/account path is new and executable, but Patient data visibility, editability, and future client surface are intentionally unresolved. |
| Account recovery/password reset | Legacy staff settings include unsafe browser-side reset behavior; Phase 12 separates recovery from activation | `INTENTIONALLY_REJECTED_LEGACY_BEHAVIOR` | Legacy evidence records an operator need only. Recovery proof, delivery channel, authority, credential replacement, provider reset, and session semantics remain deferred. |
| Direct browser Supabase queries, localStorage session authority, single-role assumptions, and destructive identity deletion | [Legacy login](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/login/page.tsx), [legacy queries](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | `INTENTIONALLY_REJECTED_LEGACY_BEHAVIOR` | These are implementation patterns, not business requirements, and conflict with the accepted server-side fail-closed architecture. |

The three utility rows separate business evidence from implementation acceptance. `MISSING_HIGH_CONFIDENCE` records that operators needed to find and repair data exceptions; it does not accept the legacy mutation mechanism. In particular, `correct-data` calls browser-originated Admin endpoints that use a service-role Supabase client and can delete whole `users` rows, while `address-migration` and `cleanup-goals` write/delete through a browser Supabase client. Those implementation details are `INTENTIONALLY_REJECTED_LEGACY_BEHAVIOR`. The rewrite still needs a separately accepted, server-side repair/reconciliation policy before any correction, merge, deletion, conflict, audit, or relationship-impact behavior can be implemented.

## 4. Cross-module handoff analysis

Handoff finding IDs use the `HF-##` namespace. Prioritized Phase 13 closure candidates use the separate `P13-*` namespace; the two namespaces must not be conflated.

### Actual end-to-end chain

The current routes can execute the following chain when the demonstrator manually changes actor/session where the business boundary requires it:

```text
Public Hospital application
  → Platform Admin review/approve
  → Hospital ACTIVE + applicant User ACTIVE + exact OWNER membership
  → Owner /app/workforce
  → workforce/OSM provisioning
  → target first-time activation and separate login
  → Owner or Hospital member /app/patients/provision
  → PatientHospitalRelationship created/reused
  → Patient directory / Patient Detail
  → Owner OSM assignment
  → OSM /app/patients/assigned
  → Screening
  → explicit Goal Plan
  → Appointment
  → mark Appointment COMPLETED
  → Follow-up with optional Appointment/Goal context
  → Patient Detail Profile / Baseline / status evidence and historical records
```

The persistence and authorization boundaries in this chain are coherent: the relationship ID remains the resource key, policies re-check exact Hospital/OSM scope server-side, and lower-level domain actions do not silently create unrelated records. The problems below are handoff and discoverability findings, not permission failures.

| ID | Handoff finding | Evidence and effect on a live demonstration | Classification |
|---|---|---|---|
| HF-01 | Admin approval completes the business transition but returns to the Admin application detail page. | [Review server action](../../src/modules/hospital-onboarding/transport/server-actions.ts) revalidates and redirects to the same Admin detail. The applicant must separately open `/login`; automatic session switching would be incorrect. | Minor handoff gap; P13-MEDIUM candidate |
| HF-02 | The Owner/Member/OSM landing page does not expose a next business step. | [Current `/app`](../../app/app/page.tsx) says no summary data is available, while [navigation](../../src/components/app-shell/application-navigation.ts) exposes authorized menu items only. A demonstrator can continue, but must choose the next module without workflow context. | P13-HIGH |
| HF-03 | Workforce activation itself is reachable and the one-time link/QR is intentionally shown, but the post-activation continuation is generic. | [Workforce workspace](../../app/app/workforce/workforce-workspace.tsx) presents the token, and `/activate/workforce` is a real target-owned credential flow. After the target logs in, `/app` does not carry a “return to this Hospital/workspace” context. | Minor handoff gap; P13-MEDIUM candidate |
| HF-04 | Patient provisioning does not hand the demonstrator to the Patient Detail record. | The service result contains `relationshipId` in [patient provisioning service](../../src/modules/patient-provisioning/services/patient-provisioning-service.ts), but [the success component](../../app/app/patients/provision/patient-provisioning-workspace.tsx) only links to Patient activation when the account is provisioned. The demonstrator must return to the directory and search again. | P13-HIGH |
| HF-05 | Patient activation is a credential handoff, not a care-workspace handoff. | The Hospital actor issues the one-time token in [activation workspace](../../app/app/patients/activation/patient-activation-actions-workspace.tsx); the Patient can activate and log in, but the Patient role has no current data route. | Requirement boundary, not an implementation blocker |
| HF-06 | Patient Detail is the strongest current integration hub. | [Patient Detail](<../../app/app/patients/[relationshipId]/page.tsx>) links to assignment, Screening, Goals, Appointments, Follow-up, Baseline, and Evidence using the same relationship ID. No missing identity conversion was found after the demonstrator reaches this page. | Covered; preserve |
| HF-07 | Screening detail does not provide a direct “continue to Goal Plan” action. | [Screening detail](<../../app/app/patients/[relationshipId]/screenings/[screeningId]/page.tsx>) links back to Patient Detail and Screening history. Goals can be opened from Patient Detail and the Goal form can use current Screening context, but the demonstrator must choose that route manually. | P13-MEDIUM |
| HF-08 | Goal detail does not provide a direct “record Follow-up” action or preselected Goal Plan context. | [Goal detail](<../../app/app/patients/[relationshipId]/goals/[goalPlanId]/page.tsx>) links to Patient Detail, Goal history, source Screening, and a new Goal Plan. [Follow-up form](<../../app/app/patients/[relationshipId]/followups/new/followup-form.tsx>) supports `sourceGoalPlanId` but currently makes the demonstrator select the plan from a list. | P13-MEDIUM |
| HF-09 | Appointment → Follow-up is already a coherent handoff. | [Appointment detail](<../../app/app/patients/[relationshipId]/appointments/[appointmentId]/page.tsx>) links to Follow-up with `appointmentId`; the Follow-up page verifies that the Appointment is `COMPLETED`. No new orchestration is needed. | Covered; preserve |
| HF-10 | Assignment → OSM assigned Patient directory is already a coherent handoff. | Owner assignment uses the exact relationship and [OSM navigation](../../src/components/app-shell/application-navigation.ts) exposes `/app/patients/assigned` only for active OSM scope. A separate OSM login is expected. | Covered; preserve |
| HF-11 | Hospital lifecycle status is enforced but not surfaced as a continuation state to the affected workspace. | [Phase 12B.0](PHASE_12B0_HOSPITAL_LIFECYCLE_WORKING_PROTOTYPE.md) confirms status-only/no-cascade and fail-closed downstream access. The generic `/app` page still presents “พร้อมใช้งาน” and no Hospital-specific status explanation. The final visibility/explanation policy is open, so only a bounded status notice is safe. | P13-MEDIUM candidate, subject to wording boundary |
| HF-12 | No material Thai terminology blocker was confirmed. | Current routes use stable domain terms such as `Screening`, `Goals / Activity Plan`, `Appointments`, `Follow-ups`, and Thai explanatory labels. Wording can be polished later, but no inconsistent term currently prevents the journey. | Not a blocker |

No happy-path stage requires a demonstrator to copy a raw database ID. HF-04 is a discoverability problem because the UI drops an already-authoritative result and requires a name/HN search; it is not a security reason to expose opaque IDs to users.

## 5. Golden demo journeys

These journeys are repeatable prototype scenarios for workshops, not final customer requirements.

### A. Platform Admin / Hospital onboarding

| Stage | Current path and result |
|---|---|
| 1 | Trusted bootstrap creates the first Platform Admin; the Admin signs in at `/login`. |
| 2 | Applicant submits a Hospital organization application at `/hospital/onboarding`; the public flow does not grant role or Hospital authority. |
| 3 | Admin opens `/app/admin/hospital-onboarding`, reviews, and approves. The service creates/activates the Hospital and establishes the applicant's Hospital Owner state atomically. |
| 4 | Applicant separately signs in with the established credentials and reaches `/app`; authorized Owner navigation then reaches `/app/workforce` and Patient operations. |

**Classification: `WORKS_WITH_MINOR_HANDOFF_GAPS`.** The accepted state transition works end to end. The only interruption is the correct multi-actor boundary: Admin approval does not impersonate or log in as the applicant. The Admin screen does not provide a concise “Hospital is ACTIVE; applicant should now sign in” continuation panel, and the Owner landing page is generic.

### B. Hospital Owner / workforce journey

| Stage | Current path and result |
|---|---|
| 1 | Owner opens `/app/workforce`, selects an authorized Hospital, and provisions a Hospital member or OSM. |
| 2 | The workspace shows a one-time activation URL/QR or an explicit assisted activation result. The target user opens `/activate/workforce` and sets their own password. |
| 3 | Target logs in; the account and exact relationship become active. Owner refreshes the workforce list and opens the relationship detail. |
| 4 | Owner can demonstrate profession update, member suspend/restore, OSM suspend/restore guard, and Owner promotion/demotion where the required second member/Owner exists. |

**Classification: `WORKS_WITH_MINOR_HANDOFF_GAPS`.** The core flow is executable. It depends on a manual token/QR presentation by design, and the newly activated actor lands on a generic `/app` rather than a selected Hospital continuation. No email/SMS delivery is required for this prototype.

### C. Hospital / OSM Patient-care journey

| Stage | Current path and result |
|---|---|
| 1 | An active direct Hospital Owner/Member (or an active OSM in its accepted provisioning scope) provisions a Patient at `/app/patients/provision`; the service reuses identity and creates the exact Hospital relationship. |
| 2 | Demonstrator returns to `/app/patients`, searches by name/HN, and opens Patient Detail. This is the current HF-04 handoff gap. |
| 3 | Owner opens Assignment, chooses an active OSM, and saves. OSM signs in and finds the Patient under `/app/patients/assigned`. |
| 4 | Hospital actor or assigned OSM opens Screening, submits a provisional assessment, and views its historical detail. |
| 5 | Demonstrator opens Goals from Patient Detail, creates an explicit Goal Plan with optional Screening context, and views the Goal Plan detail. |
| 6 | Demonstrator creates an Appointment, changes it to `COMPLETED`, then uses the direct Appointment-detail Follow-up action. Follow-up can explicitly select a Goal Plan and records immutable progress context. |
| 7 | Patient Detail exposes the read-only profile, Baseline creation/read path, Evidence list/upload path, and all historical records already created. |

**Classification: `WORKS_WITH_MINOR_HANDOFF_GAPS`.** This is the strongest broad demo journey. It currently requires one return/search after provisioning and manual navigation from Screening to Goals and Goal Plan to Follow-up. Evidence upload additionally requires a configured private Supabase Storage bucket; it is not a reason to widen the data model.

### D. Patient journey

| Stage | Current path and result |
|---|---|
| 1 | Hospital actor provisions the Patient and issues a Patient-specific activation credential. |
| 2 | Patient claims `/activate/patient`, establishes a first credential, and signs in at `/login`. |
| 3 | The active Patient reaches the generic `/app` landing page. No Patient-facing data projection, navigation, or self-service edit flow is currently available. |

**Classification: `REQUIREMENT_UNRESOLVED`.** Authentication and first-time activation are implemented, but the permitted Patient-facing data and actions have not been accepted. Legacy does not supply a Patient portal to copy: its inspected login is an Admin/staff gate. Phase 13B.0 must not invent this behavior.

### E. Governance and lifecycle journey

| Stage | Current path and result |
|---|---|
| Workforce membership | Owner opens a staff relationship detail, changes profession where applicable, and suspends/restores an ordinary `MEMBER`; account credentials and User status remain separate. |
| OSM relationship | Owner opens an OSM relationship detail. Suspend is blocked while the exact Hospital has a current Patient assignment; after unassignment, suspend/restore can be demonstrated. Restore does not recreate assignments. |
| Hospital lifecycle | Admin opens Hospital governance, suspends the exact active Hospital, observes that downstream Hospital-scoped access fails closed without cascading lower-level records, then restores it. |
| Hospital Owner governance | Owner promotes an eligible member, demonstrates `OWNER` affordances, and demotes only when another eligible Owner remains. The final eligible Owner guard is observable. |

**Classification: `WORKS_WITH_MINOR_HANDOFF_GAPS`.** The bounded mutations and guards are executable and well tested. The demo requires prepared second-member/second-owner state for every branch, and Hospital suspension is not clearly explained on the affected `/app` landing page. Final account, session, emergency, transfer, and recovery semantics remain open.

## 6. Minimum deterministic demo data and setup

No synthetic dataset or automatic seed expansion is recommended in Phase 13A.

| Required state | Can normal application flow create it? | Current setup requirement / limitation |
|---|---|---|
| Database, Supabase Auth, server-only credentials, and private storage when demonstrating Evidence | No; environment/deployment setup | Configure the development `.env` values described in [README](../../README.md). Evidence upload additionally needs the private Supabase Storage bucket described in [Phase 10D.0](PHASE_10D0_PATIENT_STATUS_ARTIFACTS_WORKING_PROTOTYPE.md). |
| Canonical Hospital Master | No; seed/setup boundary | Run `npm run db:seed` to import the approved 78-record Hospital Master dataset. This is deterministic and idempotent; it is not a business event in the demo. |
| First Platform Admin | No; trusted setup boundary | Run the interactive `npm run admin:bootstrap`. There is intentionally no browser Admin signup. |
| One Hospital onboarding applicant and Owner | Yes | Submit the public onboarding form, approve it as Admin, then sign in as the applicant. No manual database row is required for the happy path. |
| One ordinary Hospital member and one OSM | Yes | Owner provisions each through `/app/workforce`; target users must receive the one-time link/QR and activate manually. No email/SMS provider is needed. |
| One Patient with identity-reuse check | Yes | Provision one Patient with a deterministic test National ID/HN, then repeat the same identity to demonstrate no duplicate relationship. The UI currently requires a return to directory search after the success message. |
| One active OSM assignment | Yes | Owner assigns the provisioned OSM from Patient Detail. OSM then uses the assigned directory. |
| Screening, Goal Plan, Appointment, and Follow-up records | Yes | Create them through the relationship-scoped routes. Follow-up linked to an Appointment requires that Appointment to be `COMPLETED`; Goal context is explicitly selected. |
| Baseline | Yes | Create one immutable Baseline from Patient Detail. The current prototype permits one Baseline per relationship. |
| Status evidence image | Yes, conditionally | Use the existing upload route only when private Storage is configured. Otherwise the core care journey remains demonstrable without an image upload. |
| Staff membership suspend/restore | Yes | Use the provisioned active ordinary member. The account must satisfy the current active-account precondition. |
| OSM suspend/restore guard | Yes | To show the blocked branch, keep one active assignment; to show a successful suspend/restore, unassign first. No special schema fixture is required. |
| Owner promotion/demotion and final-owner guard | Yes | Provision a second member and, for demotion, ensure another eligible Owner exists. The current Owner governance service supplies the invariant; do not create a separate fixture by direct DB mutation for the normal journey. |
| Hospital suspend/restore | Yes | Admin needs the approved active Hospital. Existing membership, Patient, OSM, and clinical rows can remain to demonstrate the no-cascade behavior. |

The local integration harness can reproduce service/database behavior when the disposable PostgreSQL container and environment are available, using the repository's migration and integration commands. It is not a browser-level demo harness and does not provide a single seeded multi-actor workshop scenario. The only expected trusted/manual preparation for the happy path is Admin bootstrap, Hospital Master seed, provider/environment setup, and copying one-time activation links. Manual database manipulation is not required for the normal golden journeys; it is only relevant to deliberately testing unresolved reconciliation/recovery or unusual cross-Hospital fixtures.

## 7. Prioritized closure matrix

`Requirements known?` means “known enough to add a navigation/orchestration boundary without deciding a new business rule,” not “the final production policy is settled.”

| ID | Category | Closure candidate or decision | Why it matters to the demo | Requirements known? | Expected implementation boundary | Schema change? | Can implement without inventing business rules? |
|---|---|---|---|---|---|---|---|
| P13-B0 | `P13-BLOCKER` | No confirmed blocker found for the accepted onboarding-to-care golden demo | Every accepted core flow inspected has a route/service/policy path. Patient self-service and recovery are unresolved requirements, not accepted missing slices. Residual Admin reconciliation is tracked separately and is not required to demonstrate this golden demo. | Yes — conclusion only | No implementation | No | Yes |
| P13-H1 | `P13-HIGH` | Add actor-aware “next step” panels to `/app` using existing server-derived capabilities and Hospital scopes | The current landing page is a dead-end overview for a requirement workshop; the demonstrator must guess which menu starts the next stage. | Yes, for links/status only | Server-render existing ActorContext-derived cards/links; reuse current routes and selected Hospital query conventions; do not add aggregate analytics. | No | Yes |
| P13-H2 | `P13-HIGH` | Preserve Patient provisioning result context and link the single-provisioning success state to Patient Detail and the appropriate activation workspace | The service already knows the exact `relationshipId`, but the UI drops it. This is the clearest avoidable break in the Patient-care journey. | Yes | Extend the existing action/result presentation with the already returned relationship ID and safe Hospital context. For bulk import, only show per-row links when the service result has an authoritative relationship ID; otherwise provide a directory continuation, not guessed IDs. | No | Yes |
| P13-H3 | `P13-HIGH` | Add contextual continuation links between workforce/activation and the selected Hospital workspace | The target-owned activation flow is correct, but after activation the actor loses the demonstrator's selected Hospital/workspace context. | Yes, for continuation only | Reuse existing `hospitalId` route query and relationship detail links; preserve actor/session boundaries and never auto-login or impersonate. | No | Yes |
| P13-H4 | `P13-MEDIUM` | Add related-record entry points for Screening → Goals and Goal Plan → Follow-up | Existing routes and optional provenance already support the concepts; the demonstrator currently has to backtrack to Patient Detail or manually select a Goal Plan. | Yes, for navigation and existing optional context | Add links from existing detail projections. If a Goal Plan context query is used, preselect only the exact existing plan; do not create a Goal automatically or infer a clinical recommendation. | No | Yes |
| P13-M1 | `P13-MEDIUM` | Add a bounded post-approval status/next-login panel on the Admin onboarding detail | It makes the A journey legible without changing the correct separate-actor session boundary. | Yes | Existing review detail projection plus link to `/login` and explicit “Hospital ACTIVE / Owner applicant must sign in” wording; no session switching. | No | Yes |
| P13-M2 | `P13-MEDIUM` | Make existing Hospital suspension visible as a safe workspace-state message when the actor has no active Hospital scope | Governance can be demonstrated server-side, but “account ready” on a generic landing page is confusing after a Hospital is suspended. | Partially — only status visibility is known; explanation, appeal, continuity, and notification policy remain open | Display existing server-derived status and a safe route back to Admin/appropriate governance only when already authorized. Do not invent reason, appeal, recovery, or session-revocation semantics. | No | Yes, with wording review |
| P13-D1 | `DEFER` | Patient-facing data portal, Patient editing, self-service measurements, and Patient visibility rules | These are not defined by legacy and are explicitly open in the rewrite. Implementing them would invent actor authority and clinical/data ownership. | No | Future requirements and policy slice | Unknown | No |
| P13-D2 | `DEFER` | Account recovery and final-Owner/lost-Owner recovery | Phase 12 deliberately separates activation, account lifecycle, recovery, provider/session consequences, and identity reconciliation. | No | Separate recovery requirements and provider-operational design | Unknown | No |
| P13-D3 | `DEFER` | OSM geographic scope, transfer/reassignment, emergency suspension, relationship deletion, and assignment resolution | Current accepted prototype supports exact Hospital/assignment scope only; future consequences are unresolved. | No | Separate OSM/assignment requirements slice | Unknown | No |
| P13-D4 | `DEFER` | Final clinical Screening/PROM/PAM semantics, Goal templates/recommendations, adherence, measurement meaning, and profile field ownership | Current content and scoring are explicitly provisional and suitable for workshops only. | No | Customer/clinical validation before implementation | Unknown | No |
| P13-D5 | `DEFER` | Email/SMS/LINE delivery, ThaID, LIFF/native clients, notifications, background jobs, analytics, and production-scale reporting | These are infrastructure or external-policy expansions, not prerequisites for deterministic local demo navigation. | No | Separate integration/product decisions | Unknown | No |
| P13-D6 | `DEFER` | Evidence retention, deletion, replacement, malware/OCR, and broader attachment ownership | Phase 10D.0 intentionally implements only append-only relationship evidence and private short-lived access. | No | Separate artifact/storage requirements slice | Unknown | No |
| P13-D7 | `DEFER` | Admin data-quality, duplicate-identity reconciliation, exceptional-support repair, and safe Goal-duplicate remediation | Legacy `correct-data` and `cleanup-goals` demonstrate a meaningful residual operational need, but it is outside the accepted onboarding-to-care golden demo. The exact authority, correction, merge, deletion, conflict, audit, and historical-record semantics are unresolved. | No | Separate requirements and server-side repair/reconciliation slice; do not clone destructive legacy utilities or decide identity merge/delete behavior here. | Unknown | No |
| P13-R1 | `REJECT` | Copy legacy localStorage authority, direct browser Supabase writes, predictable password reset, destructive identity deletion, or role-by-first-row behavior | These patterns violate the accepted server-side authorization, identity, credential, and audit boundaries. | No | Do not implement | No | No |
| P13-R2 | `REJECT` | Restore parent/child Hospital hierarchy as implicit authority or give Platform Admin routine Patient/clinical access | This contradicts exact Hospital/OSM scope and the distinction between Platform governance and Hospital operations. | No | Do not implement | No | No |
| P13-R3 | `REJECT` | Automatically create Goals or clinical recommendations as a hidden Screening side effect | The rewrite intentionally separated Screening and Goal Plan persistence; legacy behavior is not accepted clinical policy. | No | Do not implement | No | No |

## 8. Recommended exact Phase 13B.0 scope

Phase 13B.0 should be a single bounded “demo continuity” slice with no migration. The scope below corresponds to `P13-H1` through `P13-H4`, with `P13-M1` / `P13-M2` included only where their existing route/policy boundaries are sufficient. `P13-D7` Admin reconciliation remains tracked for a later requirements/implementation phase:

1. **Actor landing continuity**
   - Replace the empty `/app` overview with server-derived next-step cards/links for Admin, Hospital Owner, Hospital Member, and OSM.
   - Show only already-authorized existing routes and the relevant Hospital context.
   - Include a bounded Hospital-state message when existing ActorContext data proves the current Hospital scope is suspended; do not add reason, appeal, notification, recovery, or session policy.

2. **Creation and activation continuation**
   - From single Patient provisioning success, link to the existing Patient Detail route using the service-returned `relationshipId` and to Patient activation when the account is still provisioned.
   - Preserve selected `hospitalId` in existing route/query conventions for Patient directory, activation, workforce, and Owner pages.
   - Add a clear post-approval Admin message/link that the applicant must separately sign in as the newly established Hospital Owner.
   - Add contextual links from Owner workforce/relationship surfaces to the already-authorized Hospital Patient workspace. Keep one-time activation as a manual, target-owned link/QR handoff.

3. **Care-chain related-record links**
   - Add a direct related-entry link from Screening detail to the existing Goals entry point.
   - Add a direct related-entry link from Goal Plan detail to the existing Follow-up form, preselecting only the exact existing Goal Plan if the current transport contract is extended to accept that context.
   - Keep Appointment completion separate from Follow-up creation, preserve immutable rounds, and do not add automatic Goal creation, clinical conclusions, or hidden writes.

4. **Focused verification**
   - Add page/transport tests for the visible continuation links, exact relationship/Hospital context preservation, and no-link behavior when server policy denies access.
   - Add a narrow service/transport test proving the authoritative Patient provisioning result is not discarded by the UI boundary.
   - Validate the five golden journeys manually in a configured development environment; do not create a large synthetic seed or a new browser automation framework solely for this slice.

This scope reuses existing services, policies, projections, IDs, and route contracts. It does not require a schema change, migration, generic workflow abstraction, generic permission rewrite, notification infrastructure, or new business policy.

## 9. Account recovery boundary

Account recovery remains unresolved and is explicitly outside Phase 13A and the recommended Phase 13B.0.

The following must not be implemented or implied by the demo handoff work:

- forgotten-password delivery channel;
- identity proof or recovery proof;
- assisted recovery authority;
- credential replacement or provider password reset behavior;
- session revocation semantics;
- Hospital Owner emergency recovery;
- lost-Owner replacement or final-Owner recovery;
- ThaID-based recovery.

Workforce and Patient activation are first-time account establishment flows with purpose-specific one-time capabilities. They are not recovery for an already active account. The absence of a recovery link on [the current login page](../../app/login/page.tsx) is therefore correct for the current contract.

## 10. Architecture and scope decisions preserved

This analysis found no contradiction requiring an ADR correction. Phase 13B.0 must preserve:

```text
Person != User
Role != Permission
Role + Capability + Scope → Policy Decision
Hospital Owner = Role.HOSPITAL + exact active OWNER HospitalMembership
Platform ADMIN != Hospital Owner
Client state is not authority
Client/UI → Server Action/Route Handler → Application Service → Policy → Prisma → PostgreSQL/Supabase
```

The proposed closure work is UI/transport orchestration over authoritative application results. It must not move authorization into UI code, bypass services to connect pages, treat Hospital parent/child metadata as authority, or broaden Patient/OSM/Admin scope by inference.

## 11. Final Phase 13A decision

The accepted onboarding-to-care golden demo has no confirmed `P13-BLOCKER`. The rewrite is suitable for requirement workshops after a small continuity pass, but it is not yet a naturally guided end-to-end demo. The highest-value closure is to make the existing state discoverable at the exact point where each actor finishes an operation and to preserve the selected Hospital/Patient relationship context.

That conclusion is limited to the golden demo. Legacy analysis still exposes a meaningful residual Admin data-quality/reconciliation and exceptional-support domain, including `correct-data` and `cleanup-goals`; it is tracked as `P13-D7` and must not be interpreted as already covered. `address-migration` remains low-value historical migration tooling for the current demo.

Phase 13B.0 should implement `P13-H1` through `P13-H4`, plus `P13-M1` / `P13-M2` only if they remain within the existing route and policy boundaries. Patient-facing requirements, Admin reconciliation/repair, recovery, clinical policy, geography, notifications, and reporting remain outside the implementation plan until separately accepted.
