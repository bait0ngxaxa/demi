# Phase 7A — Screening Requirements & Clinical Contract Closure

- **Status:** `PHASE 7A — ANALYSIS COMPLETE; PHASE 7B NOT IMPLEMENTATION READY`
- **Date:** 2026-08-16
- **Inspection mode:** Existing System Mapping — Focus Mode, expanded for the authorization, persistence, privacy, and health-data boundaries touched by Screening.
- **Scope:** Requirements discovery, domain analysis, security boundary, and the smallest proposed contract for a future Screening MVP.
- **Implementation:** None. This phase adds no Prisma model, migration, Server Action, Route Handler, persistence, or UI.

Phase 7A establishes what DEMI may safely implement later. It does not turn the
legacy PAM/PROMs behavior or any clinical classification into a current
requirement. Clinical rules that are not confirmed remain explicitly marked
`OWNER CONFIRMATION REQUIRED`.

## 1. Phase status and objective

Phase 6B.2 is implemented and closed. Phase 7A starts the first clinical-domain
requirements pass without reopening the accepted Patient access and assignment
contract.

The objective is to close the smallest useful definition of Screening:

```text
authorized assessment submission
  → validated raw responses
  → server-side deterministic result
  → reconstructable, Hospital-context-aware history
```

The proposed direction is deliberately narrow:

- a Screening is an assessment event, not a generic Patient clinical container;
- the event belongs to one `PatientHospitalRelationship`;
- the first MVP has no persisted draft unless the owner requires one;
- submitted state is append-oriented and is never silently overwritten;
- client totals, levels, zones, conductor IDs, and Hospital IDs are never authoritative;
- Screening does not create Goals, Care Plans, Measurements, appointments, or follow-up records as an implicit side effect.

Only the architectural and security constraints inherited from the current
rewrite are confirmed. The questionnaire, clinical formula, actor authority,
result visibility, review, and amendment rules still require owner decisions.

## 2. Source hierarchy and inspected evidence

The source-of-truth order used for this phase is:

1. Confirmed current business requirements.
2. Accepted ADRs.
3. Current architecture baseline.
4. `docs/CONTEXT.md`.
5. Accepted and closed phase documents.
6. Current Prisma schema, source code, and tests as implementation evidence.
7. Legacy DEMI only as behavioral and terminology evidence.

The classifications used in this document are:

| Classification | Meaning |
| --- | --- |
| **CONFIRMED CURRENT REQUIREMENT** | Directly supported by current requirements, accepted ADRs, or an already accepted phase contract. |
| **LEGACY BEHAVIOR ONLY** | Observed in the legacy application; useful domain evidence but not accepted for the rewrite. |
| **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | Legacy behavior prohibited by the current rewrite boundary. It must not be copied. |
| **PROPOSED MVP CONTRACT** | A conservative engineering recommendation for a future implementation. It is not accepted until the owner confirms the business rule. |
| **OWNER CONFIRMATION REQUIRED** | A business, clinical, privacy, or authority decision that cannot be inferred safely. |
| **DEFERRED** | Intentionally outside the first Screening implementation. |

### Current rewrite evidence inspected

- [PRODUCT.md](../../PRODUCT.md)
- [Project context](../CONTEXT.md)
- [Architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md)
- [ADR index](../adr/README.md)
- [ADR-0001 — Person and User Identity](../adr/0001-person-and-user-identity.md)
- [ADR-0002 — Role, Capability and Scope Authorization](../adr/0002-role-capability-scope-authorization.md)
- [ADR-0004 — Patient Provisioning and Activation](../adr/0004-patient-provisioning-and-activation.md)
- [ADR-0005 — Server-Side Application Boundary](../adr/0005-server-side-application-boundary.md)
- [ADR-0006 — Transactional Business Operations](../adr/0006-transactional-business-operations.md)
- [ADR-0007 — Client Transport and Mobile-Ready Architecture](../adr/0007-client-transport-and-mobile-ready-architecture.md)
- [ADR-0008 — Workforce Provisioning and Activation](../adr/0008-workforce-provisioning-and-activation.md)
- [Phase 5A — Patient Provisioning Contract](./PHASE_5A_PATIENT_PROVISIONING.md)
- [Phase 5B.1 — Patient Provisioning Core](./PHASE_5B1_PATIENT_PROVISIONING_CORE.md)
- [Phase 5B.2 — Patient First-Time Activation](./PHASE_5B2_PATIENT_FIRST_TIME_ACTIVATION.md)
- [Phase 6A — Patient Access and Assignment](./PHASE_6A_PATIENT_ACCESS_AND_ASSIGNMENT.md)
- [Phase 6B.1 — Patient Directory / Minimal Detail](./PHASE_6B1_PATIENT_DIRECTORY.md)
- [Phase 6B.2 — OSM ↔ Patient Assignment](./PHASE_6B2_PATIENT_OSM_ASSIGNMENT.md)
- [Current Prisma schema](../../prisma/schema.prisma)
- [ActorContext type](../../src/modules/auth/types/actor-context.ts) and [ActorContext service](../../src/modules/auth/services/actor-context-service.ts)
- [Authorization primitives](../../src/modules/auth/policies/authorization.ts)
- [Patient read policy](../../src/modules/patient-directory/policies/patient-directory-policy.ts)
- [Patient directory query service](../../src/modules/patient-directory/services/patient-directory-query-service.ts)
- [OSM assignment policy](../../src/modules/patient-assignment/policies/patient-osm-assignment-policy.ts)
- [OSM assignment service](../../src/modules/patient-assignment/services/patient-osm-assignment-service.ts)
- [Audit schema](../../src/modules/audit/schemas/audit-schemas.ts) and [audit service](../../src/modules/audit/services/audit-service.ts)
- [Application navigation projection](../../src/components/app-shell/application-navigation.ts)
- Current Patient directory, assignment, authorization, audit, and integration tests under `src/` and `tests/`

### Legacy evidence inspected

The local checkout is `raviut-max/demi-plus-web-v2` at commit
`7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e`.

- [Patient Screening page](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/%5Bid%5D/screening/page.tsx)
- [Patient Screening history](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/%5Bid%5D/screening-history/page.tsx)
- [Global Screening page](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/screening/page.tsx)
- [Legacy Patient detail](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/%5Bid%5D/page.tsx)
- [Legacy Supabase queries](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts)
- [Legacy Supabase browser client](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/client.ts)

The legacy repository does not contain a committed SQL schema, question seed,
or scoring specification. The question counts and answer ranges below are
therefore inferred from the legacy UI and query code, not verified against a
live legacy database. This is an inspection limitation and a reason to require
owner confirmation before implementation.

## 3. Existing architecture invariants

The following are **CONFIRMED CURRENT REQUIREMENT** and are not reopened by
Phase 7A:

- `Person` represents the human; `User` represents the application account.
- One human keeps one core identity. Adding a Patient role or working with another Hospital must not create a duplicate `Person` or `User`.
- Roles, Hospital memberships, OSM–Hospital relationships, capabilities, and resource scope are separate concepts.
- `Doctor`, `Nurse`, `COORDINATOR`, and `OTHER` are profession classifications, not top-level authority by themselves.
- Authorization is server-side, fail-closed, and evaluates `Role + Capability + Scope + Target Resource`.
- Browser state, hidden navigation, request parameters, and client-calculated values are not authorization evidence.
- The application boundary remains:

  ```text
  Client/UI
    → Server Action or Route Handler
    → Application Service
    → Policy/Authorization
    → Prisma
    → PostgreSQL/Supabase
  ```

- Application Services own business orchestration; transport adapters do not own clinical rules or Prisma orchestration.
- Consistency-critical local writes and their successful audit event belong in one transaction.
- Provider authentication I/O is not part of a fake distributed transaction.
- `Hospital.parentHospitalId` and parent/child metadata do not grant Patient or clinical authority.
- Platform `ADMIN` is a governance, audit, recovery, reconciliation, and exception actor, not a routine Patient operator.
- Screening health data must use minimal projections and must not expose raw National ID, `identityKeyHash`, authentication/provider data, activation secrets, or passwords.

## 4. Current Phase 6 implementation boundary

Phase 6B.2 currently provides the following **CONFIRMED CURRENT REQUIREMENT**
and implementation evidence:

```text
Person
  → User + PATIENT role
  → PatientProfile
  → PatientHospitalRelationship(patientProfileId, hospitalId, hospitalNumber)
  → optional PatientOsmAssignment
```

- One `PatientProfile` may have multiple `PatientHospitalRelationship` rows.
- The `(patientProfileId, hospitalId)` relationship is the Hospital-local Patient context; no one-Hospital invariant exists.
- Hospital `OWNER` and `MEMBER` may use `patient:read` only through a direct active membership and the same active Hospital context.
- `Profession` does not change current Patient directory visibility.
- OSM access is `ASSIGNED_PATIENTS` only after an active first-class `PatientOsmAssignment` in the matching Hospital context.
- `OsmHospitalRelationship` alone proves only direct OSM–Hospital association. It does not prove Patient assignment, ownership, geographic scope, or clinical authority.
- B6.2 permits one active OSM assignment per Patient–Hospital relationship, preserves assignment history, and denies access immediately when the OSM or relationship becomes inactive.
- Platform `ADMIN` has no routine Patient-directory access.
- Current routes are `/app/patients`, `/app/patients/[relationshipId]`, `/app/patients/assigned`, and the Hospital OWNER assignment workspace under `/app/patients/[relationshipId]/assignment`.
- Current Patient projections contain only display name, Hospital context, Hospital-local HN, and opaque relationship/profile identifiers. They do not contain clinical fields.
- No Screening model, persistence, clinical policy, result projection, or Screening navigation exists in the rewrite.

The key boundary is:

```text
PatientOsmAssignment = operational Patient scope
PatientOsmAssignment ≠ Screening authority
```

## 5. Legacy Screening behavior

The following table separates observed behavior from rewrite decisions.

| Legacy finding | Classification | Evidence and safe interpretation |
| --- | --- | --- |
| The two Screening entry points allow legacy `admin`, `doctor`, `helper`, and `osm` roles after reading a local-storage session. | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | `checkSession()` and client-side role arrays are not a server authorization boundary. They evidence historical operator classes only. |
| The global page loads Patients through a network-shaped Hospital list. Main Hospitals see themselves and active children; sub-Hospitals see their parent, active siblings, and themselves; a super admin receives an empty filter that means “all.” | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | `getAccessibleHospitalIds()` and `app/admin/screening/page.tsx` expand scope through hierarchy and treat an empty filter as broad access. Rewrite scope must remain direct and server-resolved. |
| Screening uses a Patient selector in the global page and a Patient-specific page. | **LEGACY BEHAVIOR ONLY** | The list-to-form and Patient-detail-to-form workflows are useful UX evidence. The rewrite must use an authorized opaque `PatientHospitalRelationship` target. |
| Questions are loaded from `screening_questions` by `question_type` (`pam` or `proms`) and active/question-number ordering. | **LEGACY BEHAVIOR ONLY** | This suggests a fixed questionnaire family, but no committed question rows or version model were found. |
| The form stores PAM and PROMs answers in browser state and calculates totals, minimums, percentage, level, zone, priority, and “requires intensive care” before submit. | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | The browser may render a preview, but it must not be the source of canonical clinical results. |
| `saveScreening()` accepts totals, labels, zone, low-score flags, confidence, conductor ID, and response rows from the browser. | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | Current DEMI must validate raw responses and resolve actor, target, Hospital context, and calculated outputs on the server. |
| `saveScreening()` inserts a Screening, inserts responses, and then updates the Patient profile in separate browser Supabase calls. | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | These writes are not one local consistency boundary and can leave partial or conflicting state. |
| `conducted_by` is supplied as `user?.id` from browser state. | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | The rewrite must derive the conducting actor from the authenticated server-side `ActorContext`. |
| Screening history returns multiple Screening rows in descending `screening_date` order and displays a timeline/detail modal. | **LEGACY BEHAVIOR ONLY** | Multiple assessment events and a timeline are useful evidence for a proposed append-oriented history. |
| History shows date, PAM label, Zone, PAM score, PROMs total, and the display name of the conducting user. | **LEGACY BEHAVIOR ONLY** | These fields are candidates for a minimal projection only after result semantics and visibility are confirmed. |
| History recalculates PROMs total from response rows when available and falls back to four stored columns otherwise. | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | Historical projections should read one server-calculated result snapshot tied to a scoring version, not repair inconsistent data in the browser. |
| No review workflow, review actor, correction route, amendment record, or submitted-state transition is present. The global form says the result cannot be edited retrospectively. | **LEGACY BEHAVIOR ONLY** | This is evidence for an immediate-final MVP option, not proof that the current product requires immutability or forbids correction. |
| After successful Screening save, both entry points call `createDefaultGoals()` separately. | **LEGACY BEHAVIOR ONLY** | This is a historical coupling and must not become a Screening side effect without an explicit current requirement. |
| Patient detail displays measurements, current PAM/Zone, appointments, follow-up, and Goals next to Screening links. | **LEGACY BEHAVIOR ONLY** | The detail page is a broad legacy dashboard. It does not define the rewrite's Screening projection or a measurement boundary. |
| `lib/supabase/client.ts` creates a browser Supabase client with public environment values, and query functions perform direct reads/writes. | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | The rewrite must use the server application boundary, policy, scoped Prisma queries, and transactions. |

### Legacy write sequence

The observed legacy sequence is:

```text
browser role check
  → browser loads Patient/questions
  → browser calculates result
  → insert screenings
  → insert screening_responses
  → update profiles.pam_level / zone / pam_score
  → separate createDefaultGoals call
```

The rewrite target is materially different:

```text
server authentication
  → parse raw validated responses
  → resolve PatientHospitalRelationship and Hospital scope
  → authorize dedicated Screening capability
  → calculate result on the server
  → persist Screening, responses, result/version, and audit atomically
```

## 6. Screening domain definition

### 6.1 Canonical definition

**PROPOSED MVP CONTRACT:** A Screening is one dated assessment event for one
Patient in one Hospital context. It records a validated submission of an
approved, fixed questionnaire set and the deterministic result calculated from
that submission.

Screening therefore combines three related concerns:

1. **Assessment event:** who conducted it, for which Patient–Hospital relationship, and when it was submitted.
2. **Questionnaire submission:** the validated raw answers for the approved version of the first MVP questionnaire.
3. **Calculated result:** the server-produced, versioned totals and classifications derived from those answers.

Screening is not a generic container for every piece of Patient clinical data.

### 6.2 Domain boundary

| Inside Screening | Outside Screening unless separately confirmed |
| --- | --- |
| Assessment identity and status | Person identity proofing and authentication |
| Patient–Hospital relationship context | Patient demographics and profile editing |
| Conducting actor identity | Hospital membership or OSM provisioning |
| Approved question-set responses | Universal clinical measurements/observations |
| Server-calculated result snapshot | Goals and Care Plans |
| Assessment and submission timestamps | Appointments, visits, follow-up, referrals, and notes |
| Correction/amendment link, only if that workflow is accepted | Clinical dashboards and reporting |

### 6.3 Domain vocabulary

The following terms are proposed for future implementation; they are not new
Prisma models in this phase:

- **Screening:** the persisted assessment event.
- **Question set:** the fixed set of questions used by one assessment type.
- **Question set version:** the immutable identifier for the exact question definitions used.
- **Response:** one validated answer to one question in that version.
- **Calculated result:** server-derived output, never a browser-authoritative input.
- **Conductor:** the authenticated DEMI User who performs the assessment; the term does not mean a Patient owner.
- **Review:** a separate business action that confirms or changes workflow state; it is not implied by submission.
- **Amendment/correction:** a new preserved revision linked to a submitted assessment, not an overwrite.

## 7. Actor and workflow analysis

The actor model must distinguish authentication, operational access, and
clinical Screening authority.

### 7.1 Operation analysis

| Operation | HOSPITAL | OSM | PATIENT | ADMIN |
| --- | --- | --- | --- | --- |
| Create a persisted draft | **OWNER CONFIRMATION REQUIRED**; no draft is proposed by default | **OWNER CONFIRMATION REQUIRED**; assignment alone is insufficient | **DEFERRED** | **DENIED** for routine operation |
| Submit a new Screening | **OWNER CONFIRMATION REQUIRED**; must use direct Hospital context and a dedicated capability | **OWNER CONFIRMATION REQUIRED**; default deny until explicit clinical authority is accepted in addition to assignment | **DEFERRED / DENIED** in first MVP | **DENIED** for routine clinical operation |
| Read Screening history/detail | **OWNER CONFIRMATION REQUIRED**; `patient:read` must not imply `screening:read` | **OWNER CONFIRMATION REQUIRED**; if enabled, require active assignment and same Hospital context | **DEFERRED** to a future SELF projection | **DENIED** for routine operation |
| Review/confirm | **OWNER CONFIRMATION REQUIRED**; not in the smallest MVP | **DENIED** unless a separate policy is accepted | **DENIED** | **DENIED** as routine; governance is a separate future operation |
| Correct/amend | **OWNER CONFIRMATION REQUIRED**; must preserve original state | **OWNER CONFIRMATION REQUIRED**; never inferred from assignment | **DEFERRED** | **DENIED** as routine; reconciliation must be explicit and audited |

### 7.2 Conductor identity

**PROPOSED MVP CONTRACT:** The conductor is the server-resolved active
application `User` performing the operation. The request may contain no
authoritative conductor ID. The service stores an opaque `conductedByUserId`
reference and the audit event uses the authenticated actor as its actor.

The conductor must not be inferred from a browser role, a Patient record, an
OSM assignment, a Hospital owner field, or a display name.

### 7.3 Missing authority behavior

Until an actor/capability/scope decision is confirmed, the operation is
`DENIED`. A visible action, an active OSM relationship, a Patient assignment,
or a profession label must not turn an unresolved clinical policy into allow.

## 8. Patient/Hospital/OSM scope analysis

### 8.1 Resource scope

**PROPOSED MVP CONTRACT:** Screening belongs to a specific
`PatientHospitalRelationship`, not directly to `Person`, `User`, `PatientProfile`,
or a global Patient ID.

```text
Person / User
  → PatientProfile
    → PatientHospitalRelationship(Hospital A)
      → Screening timeline A

    → PatientHospitalRelationship(Hospital B)
      → Screening timeline B
```

The same human may therefore have separate Screening timelines in Hospital A
and Hospital B. A Screening created in Hospital A cannot authorize access to a
relationship in Hospital B.

### 8.2 Hospital scope

The target Hospital is resolved from the target relationship in authoritative
database state. A browser-supplied Hospital ID may be context input, but it is
not proof of authority and must match the relationship's Hospital after server
authorization.

For a future Hospital policy, the minimum scope predicate is expected to be:

```text
active User
+ HOSPITAL role
+ direct active OWNER or MEMBER membership in relationship.hospitalId
+ active target Hospital
+ dedicated Screening capability
+ target Screening.patientHospitalRelationshipId belongs to that Hospital
```

Whether both membership types may conduct or read clinical Screening remains
**OWNER CONFIRMATION REQUIRED**. Parent, child, sibling, and network Hospitals
must not be added to this predicate by implication.

### 8.3 OSM scope

The following are three separate facts:

```text
active OsmHospitalRelationship
active PatientOsmAssignment for the same PatientHospitalRelationship
explicit Screening capability
```

**PROPOSED MVP CONTRACT:** OSM Screening access is denied unless the owner
explicitly grants a dedicated capability. If OSM authority is accepted later,
the minimum target predicate should require all of:

```text
active User + OSM role
+ active OsmHospitalRelationship in the target Hospital
+ active PatientOsmAssignment for the target PatientHospitalRelationship
+ active target Hospital
+ dedicated Screening capability
```

An assignment remains operational scope; it is not clinical authority by
itself. Hospital hierarchy does not widen the OSM target set.

### 8.4 Patient and ADMIN scope

- Patient `SELF` scope remains a confirmed architecture concept, but Patient-facing clinical workflows are **DEFERRED** from the first Screening MVP.
- Platform `ADMIN` has no routine Screening authority. A future governance, audit, reconciliation, or support operation would need a separately named capability, resource scope, projection, and audit contract.

## 9. Screening data contract and conceptual model

This section is conceptual only. It intentionally does not finalize Prisma
columns or a generic questionnaire engine.

### 9.1 Minimum conceptual graph

```text
PatientHospitalRelationship
  └── many Screening events
        ├── conductedByUser
        ├── approved question-set version
        ├── validated Responses
        ├── server-calculated Result snapshot
        ├── submittedAt (server time)
        └── optional amendment/review references
```

### 9.2 Concept evaluation

| Concept | MVP treatment | Classification |
| --- | --- | --- |
| Screening / assessment event | Required if Screening is accepted; one event per submission | **PROPOSED MVP CONTRACT** |
| Question set | One explicitly approved PAM/PROMs set only; no builder | **OWNER CONFIRMATION REQUIRED** |
| Question set version | Required to reconstruct the exact questionnaire used | **PROPOSED MVP CONTRACT** |
| Question | Fixed definitions keyed by the approved version; may live in trusted code/seed data rather than a generic editor | **PROPOSED MVP CONTRACT** |
| Response | Required raw validated answers; unknown, duplicate, missing, and out-of-range answers fail validation | **PROPOSED MVP CONTRACT** |
| Calculated result | Required only after the scoring rule is approved; persisted from server calculation | **PROPOSED MVP CONTRACT** |
| Conducted by | Required opaque DEMI User reference resolved from the authenticated actor | **PROPOSED MVP CONTRACT** |
| PatientHospitalRelationship | Required target and authorization context | **PROPOSED MVP CONTRACT** |
| Occurred at | Separate business time is not yet confirmed; do not accept arbitrary browser backdating | **OWNER CONFIRMATION REQUIRED** |
| Submitted at | Required server timestamp for the no-draft submission MVP | **PROPOSED MVP CONTRACT** |
| Status | `SUBMITTED` is sufficient if there are no drafts/review; more states require requirements | **PROPOSED MVP CONTRACT** |
| Correction/amendment | Not required for the first write slice; if accepted, preserve the original | **OWNER CONFIRMATION REQUIRED** |

### 9.3 Response shape

**PROPOSED MVP CONTRACT:** A response should contain a stable question key or
opaque question identifier, the selected validated answer value, and the
question-set version context. It should not accept question text, result
totals, zone, level, or conductor identity from the browser as authoritative.

The first implementation should use an explicit typed definition for the
approved question set. It should not introduce arbitrary question types,
conditional branching, question-builder CRUD, or a generic rules engine.

## 10. PAM/PROMs legacy analysis

### 10.1 Observed question and answer behavior

| Legacy set | Observed number/type | Observed answer scale | Observed persistence |
| --- | --- | --- | --- |
| PAM | UI text says 5 questions | Buttons `1`–`4`; UI text says 5 × 4 = 20 | Response rows use `question_type: 'pam'`, question ID/number, and numeric `score` |
| PROMs | UI text and validation say 4 questions | Buttons `1`–`6`; UI text says 4 × 6 = 24 | Response rows use `question_type: 'proms'`, question ID/number, and numeric `score`; four legacy summary columns are also written |
| Confidence | One slider from `0`–`10` | Integer UI buttons; default state is `0` | Optional-looking `confidence_score` plus free-text `confidence_improvement_plan` |

The actual question wording and active question rows were not present in the
legacy Git history inspected. The UI loads `screening_questions` with `select *`.

### 10.2 Legacy scoring algorithm

The two legacy Screening pages implement materially the same algorithm:

```text
pamTotal = sum(PAM answer scores)
promsTotal = sum(PROMs answer scores)
promsMin = minimum PROMs answer score

if pamTotal <= 5:
  level = L1
  zone = Red Zone
else if promsMin <= 2:
  level = L1
  zone = Red Zone
else if promsTotal <= 8:
  level = L1
  zone = Red Zone
else:
  total = pamTotal + promsTotal
  percentage = total / 44 * 100

  if percentage >= 75:
    level = L4
    zone = Green Zone
  else if percentage >= 50:
    level = L3
    zone = Yellow Zone
  else:
    level = L2
    zone = Green Zone
```

Additional legacy outputs include `priority` and `requiresIntensiveCare`.
Those outputs are not accepted clinical requirements.

### 10.3 Legacy inconsistencies and threshold risks

The code is evidence of behavior, not evidence that the formula is clinically
or product-correct:

- The UI says all five PAM questions are required, but the client validation only checks that at least one PAM answer exists.
- PROMs validation checks at least four entries but does not prove that the exact approved four question IDs were answered.
- Before a complete submission, `promsMin` defaults to `0`, which can render an incomplete form as `L1 / Red Zone` in the preview.
- The form stores `pam_level_result` as `Deny`, `General`, `Intensive`, or `Champion`, while the history UI color helper expects `L1`–`L4`.
- `saveScreening()` maps the labels to Patient profile `pam_level`, but maps every non-`Deny` label to profile `zone: Green Zone`; this can disagree with the calculated `L3 / Yellow Zone` Screening result.
- History prefers recalculating PROMs total from response rows and falls back to four summary columns, so the read model can conceal inconsistent writes.
- The displayed `maxScore` values are hardcoded in the client rather than derived from an approved versioned definition.
- No legacy code inspected records question wording/version or scoring-version metadata.

### 10.4 Classification of legacy clinical rules

| Rule or concept | Classification for the rewrite |
| --- | --- |
| PAM/PROMs names and the observed answer ranges | **LEGACY BEHAVIOR ONLY** |
| Five PAM and four PROMs question count | **LEGACY BEHAVIOR ONLY** until the question set is confirmed |
| PAM total, PROMs total, PROMs minimum, and hardcoded maxima | **LEGACY BEHAVIOR ONLY** |
| `L1`–`L4` classification | **OWNER CONFIRMATION REQUIRED** |
| Red/Yellow/Green Zone | **OWNER CONFIRMATION REQUIRED** |
| PAM/PROMs threshold formula | **OWNER CONFIRMATION REQUIRED** |
| “Priority” and “requires intensive care” flags | **OWNER CONFIRMATION REQUIRED**; do not expose or act on them without a rule |
| Minimum-question rule | **OWNER CONFIRMATION REQUIRED**; proposed default is every required question in the approved version |
| Confidence score | **OWNER CONFIRMATION REQUIRED** |
| Confidence improvement plan | **OWNER CONFIRMATION REQUIRED**; free text is sensitive clinical data |

No formula in this section is a medical recommendation. It is a concise legacy
representation for owner review only.

## 11. Scoring ownership and versioning

### 11.1 Scoring ownership

**CONFIRMED CURRENT REQUIREMENT:** Browser state and client-calculated clinical
outputs cannot be authoritative.

**PROPOSED MVP CONTRACT:** If PAM/PROMs are accepted, the server owns one
explicit deterministic domain function:

```text
raw validated responses
  → approved question-set definition
  → explicit scoring version
  → deterministic result
```

The service must:

- load or resolve the approved question-set version on the server;
- validate exact question membership, completeness, duplicates, and allowed answer values;
- calculate all totals, minima, percentages, levels, zones, and flags on the server;
- ignore or reject browser-supplied totals, result labels, levels, zones, priorities, and clinical flags;
- persist the calculated result/version with the responses in the same local consistency boundary.

### 11.2 Minimal versioning

**PROPOSED MVP CONTRACT:** Historical results must retain enough information to
answer both questions:

```text
Which question wording/answer definition was used?
Which scoring rule was applied?
```

The smallest understandable mechanism is:

- one stable question-set key and explicit `questionSetVersion`;
- one explicit `scoringVersion`;
- immutable trusted definitions for the question-set version and scoring version;
- response references to the question key/version;
- result values calculated and stored with the same versions.

The definitions may initially be checked-in typed data or controlled seed data.
There is no need for a generic questionnaire builder, rules engine, FHIR
terminology service, event-sourcing model, or external clinical terminology
system.

Whether the owner accepts the observed legacy questionnaire and formula as
version `1` is **OWNER CONFIRMATION REQUIRED**. A version number must not make an
unapproved formula authoritative.

## 12. Screening lifecycle and history

### 12.1 Minimal lifecycle

The legacy form has transient browser state and writes a completed event; it
does not persist drafts or implement review.

**PROPOSED MVP CONTRACT:** Do not persist drafts. The first write operation
creates a `SUBMITTED` Screening only after all required responses validate and
the server calculates the result. A submitted record is not silently edited.

If the owner requires a review gate, the minimum additional state should be
explicitly named, for example `SUBMITTED` → `REVIEWED`. Do not add `IN_REVIEW`,
`REJECTED`, `FINAL`, or other medical-record states without a real workflow
requirement.

### 12.2 History contract

**PROPOSED MVP CONTRACT:** Each `PatientHospitalRelationship` has an append-only
Screening timeline. The minimum list projection is:

- opaque Screening ID;
- server submission date/time;
- status;
- approved result fields, only after their semantics are confirmed;
- safe conducted-by display, if owner-approved;
- review status only if review exists.

The detail projection may include the versioned response/result detail only for
an actor with explicit `screening:read` authority. It must not expand the
current Patient directory projection and must not expose raw National ID,
identity hashes, provider/authentication data, activation state, or unrelated
clinical domains.

History must be reconstructable without relying on the Patient's current
profile-level PAM/Zone fields. Screening result snapshots are historical data;
they must not be overwritten by the next assessment.

## 13. Correction and amendment semantics

The legacy UI presents submission as non-editable, but it does not implement a
correction workflow. The rewrite must not silently overwrite a submitted health
assessment.

**PROPOSED MVP CONTRACT:** Exclude correction from the first submission slice.
If correction is required, use an append-oriented amendment:

```text
original SUBMITTED Screening remains preserved
  → new amendment/revision references the original
  → new responses/result are calculated from the approved version
  → actor, reason, timestamp, and audit event are recorded
```

An amendment is not a delete, profile overwrite, or direct update of the
original response rows. Whether Hospital, OSM, or a future governance actor
may amend, and whether the original or latest revision is shown as current,
are **OWNER CONFIRMATION REQUIRED**.

If the owner confirms that no correction is ever permitted, the policy must
return a safe denial and the history must still preserve the submitted record.

## 14. Measurements boundary

Legacy Patient detail displays `current_weight`, height, waist circumference,
BMI, blood sugar, and HbA1c. Other legacy follow-up flows also use measurement
fields. The legacy Screening form itself submits PAM/PROMs responses and
confidence fields; it does not submit those measurements as part of
`saveScreening()`.

Classification:

- Existing measurement fields in the legacy profile/follow-up system:
  **LEGACY BEHAVIOR ONLY**.
- A universal Measurement/clinical-observation domain in the rewrite:
  **DEFERRED**.
- Whether a future Screening captures point-in-time measurements:
  **OWNER CONFIRMATION REQUIRED**.

**PROPOSED MVP CONTRACT:** Keep HbA1c, blood pressure, weight, height, BMI,
waist circumference, and other measurements outside the first Screening model.
If a future requirement needs them in a Screening, it must specify field,
unit, precision, timing, validation, history, and visibility. Do not invent a
universal clinical observation model or add measurement fields to the current
Patient directory projection.

## 15. Goals / Care Plan coupling

Legacy `createDefaultGoals()` runs after a successful Screening save:

- `L1` creates no default Goals;
- `L2`/`L3` creates a configured set of five weekly activities;
- `L4` creates a configured set of eight weekly activities;
- existing active goals may be archived when their level group does not match;
- the Goal writes are separate from the Screening and response writes.

This is **LEGACY BEHAVIOR ONLY** and also demonstrates a partial-success risk
because the Screening can succeed while Goal creation fails or changes other
state.

**PROPOSED MVP CONTRACT:** Screening produces an assessment result only. A
future Goal/Care Plan operation may consume that result through its own
capability, validation, transaction, and audit boundary. Screening submission
does not create, archive, or update Goals automatically.

## 16. Capability and authorization contract

### 16.1 Smallest vocabulary

**PROPOSED MVP CONTRACT:** If the first MVP has no persisted drafts, `create` and
`submit` are one operation. Use only:

```text
screening:read
screening:submit
```

Do not add `screening:create` unless a persisted draft workflow is confirmed.
Do not add `screening:review` or `screening:amend` until those workflows are
accepted.

### 16.2 Capability matrix

All entries below remain proposed or unresolved. Unsupported authority defaults
to `DENIED`.

| Capability | HOSPITAL | OSM | PATIENT | ADMIN | Required server scope |
| --- | --- | --- | --- | --- | --- |
| `screening:read` | **OWNER CONFIRMATION REQUIRED**; candidate is active direct OWNER/MEMBER scope | **PROPOSED MVP CONTRACT:** deny by default; if enabled, require active assignment plus OSM–Hospital relationship | **DEFERRED / DENIED** in first MVP; future `SELF` only | **DENIED** for routine operation | Target `PatientHospitalRelationship` and its active Hospital |
| `screening:submit` | **OWNER CONFIRMATION REQUIRED**; direct active Hospital context; profession does not change authority unless explicitly decided | **OWNER CONFIRMATION REQUIRED**; assignment and active OSM–Hospital relationship are necessary but not sufficient | **DEFERRED / DENIED** in first MVP | **DENIED** for routine clinical operation | Target relationship, active Hospital, and explicitly accepted conductor policy |
| `screening:review` | **DEFERRED / DENIED** until review workflow is confirmed | **DENIED** unless a separate clinical policy is accepted | **DENIED** | **DENIED** as routine; future governance must be separately named | Same target Screening plus review capability and state transition |
| `screening:amend` | **DEFERRED / OWNER CONFIRMATION REQUIRED**; original must remain | **DEFERRED / OWNER CONFIRMATION REQUIRED**; assignment alone never grants it | **DEFERRED / DENIED** | **DENIED** as routine; reconciliation must be explicit | Target Screening, original relationship, amendment policy, and audit |

The existing `patient:read` capability is not a substitute for
`screening:read`; assignment is not a substitute for `screening:submit`; and
profession is not a substitute for a clinical capability.

### 16.3 Authorization equation

Every future operation must be decided as:

```text
server ActorContext
+ dedicated capability
+ server-resolved PatientHospitalRelationship
+ server-resolved Hospital/assignment state
+ target Screening state
= allow or fail-closed deny
```

The request must never be trusted for role, Hospital ID, OSM ID, Patient ID,
assignment ID, conductor ID, calculated result, PAM level, or Zone.

## 17. Transaction boundary

### 17.1 Submission

**PROPOSED MVP CONTRACT:** A successful no-draft submission is one
consistency-critical local operation:

```text
authenticate actor
  → parse and validate raw input
  → re-resolve actor, target relationship, Hospital, and accepted scope
  → resolve approved question/scoring versions
  → validate complete responses
  → calculate canonical result
  → create Screening event
  → create Response records
  → persist result/version snapshot
  → write screening.submitted audit event
  → commit
```

The exact authentication/session lookup may happen before the transaction, but
the resource and authority guard must be rechecked against current database
state inside the write boundary to reduce TOCTOU risk. No provider call,
notification, Goal creation, or unrelated read belongs inside this transaction.

### 17.2 Retry and duplicate submission

Screenings are legitimately repeatable over time, so deduplicating by Patient,
score, or timestamp would be unsafe. **PROPOSED MVP CONTRACT:** the future
submission operation must bind a bounded request idempotency key to the actor,
target relationship, and operation, or return a safe conflict for a repeated
request. It must not create duplicate events merely because a browser retries
the same submission. This is a narrow Screening submission concern, not a
generic idempotency platform.

### 17.3 Amendment/review

If review or amendment is accepted, each state change and its success audit
event must be atomic. A failed audit write must not report a successful
clinical state change.

## 18. Audit and privacy boundary

### 18.1 Audit events

Minimum events to evaluate:

| Action | Status |
| --- | --- |
| `screening.submitted` | **PROPOSED MVP CONTRACT** if submission is accepted |
| `screening.reviewed` | **DEFERRED / OWNER CONFIRMATION REQUIRED** |
| `screening.amended` or `screening.corrected` | **DEFERRED / OWNER CONFIRMATION REQUIRED** |
| Routine Screening read | **OWNER CONFIRMATION REQUIRED**; not automatically audited |

Audit metadata should contain only bounded, non-sensitive values such as:

- opaque Screening ID;
- opaque PatientHospitalRelationship ID;
- opaque Hospital ID;
- operation outcome/status;
- question-set and scoring version identifiers.

Do not log or audit for convenience:

```text
raw Thai National ID
identityKeyHash
password
provider subject or alias
activation token
full questionnaire payload
confidence narrative
clinical narrative
HN, Patient name, or raw measurement values unless separately approved
```

The existing audit schema's bounded metadata validation and transaction-
compatible service are the implementation evidence to reuse.

### 18.2 Privacy classification and projection

Screening responses and calculated results are **sensitive application data**
because they describe health-related assessment state. The future service must:

- use opaque application IDs;
- return only the minimum projection required by the accepted actor workflow;
- keep raw responses and narratives out of Patient directory/list projections;
- avoid returning authentication/provider data or raw identity values;
- distinguish “not authorized,” “not found,” and infrastructure failures using the current safe transport patterns without revealing cross-Hospital existence.

Whether an authorized OSM sees raw responses, only result summary, or a further
redacted projection is an owner decision. The same applies to Hospital MEMBER
versus OWNER visibility.

## 19. MVP projection and route analysis

### 19.1 Proposed conceptual routes

The following are route candidates, not implemented routes:

```text
/app/patients/[relationshipId]/screenings
    Screening history for one Patient–Hospital relationship

/app/patients/[relationshipId]/screenings/new
    New Screening form for an explicitly authorized relationship

/app/patients/[relationshipId]/screenings/[screeningId]
    Screening detail/result and approved response projection
```

The exact pathname can change without changing the domain contract. The route
must use the existing protected `/app` shell and current mobile-friendly UI
foundation. It must not add a global Screening selector that bypasses
Patient–Hospital context.

### 19.2 Route and transport rules

- The `relationshipId` is an opaque request target and is re-authorized on every request.
- Hospital context from the browser is local screen context only; the service resolves the authoritative Hospital from the relationship.
- OSM enters through an assignment-scoped Patient list or an explicitly authorized relationship; an active OSM–Hospital relationship alone is insufficient.
- The form submits raw answers only. Totals, level, Zone, conductor, Hospital, and assignment are server-owned.
- History/detail uses a minimal service projection and never reuses the current Patient directory projection for clinical data.
- Navigation visibility may be projected only after a confirmed policy helper exists. Navigation is not authorization.
- Server Actions are the likely web transport adapter. No `/api/v1`, native API, LIFF endpoint, queue, worker, or background job is justified by this phase.
- The form and result pages must remain usable on small screens and field devices, while preserving accessible labels, focus, error, and status behavior from the current UI foundation.

### 19.3 Minimum projection candidates

The following are candidates, not accepted fields:

| Projection | Candidate fields | Boundary |
| --- | --- | --- |
| History list | opaque ID, submitted date/time, status, approved result summary, safe conductor display | Result and conductor visibility requires owner decision |
| Detail | history fields plus versioned responses and approved result detail | Raw responses/narrative require explicit visibility policy |
| Patient directory | Existing B6.1/B6.2 projection only | **Must not expand** with Screening result, PAM, Zone, HbA1c, measurements, or clinical counts |

## 20. Owner decision table

The following decisions are unresolved. The recommended defaults are proposals,
not silent answers.

| # | Decision | Evidence | Legacy behavior | Recommended MVP default | Risk if wrong | Owner decision required |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Can OSM perform Screening for actively assigned Patients? | B6.2 defines assignment as operational scope only; no clinical capability exists. | OSM is allowed through client role checks and network Patient lists. | **DENY until explicit approval**; if approved require active assignment, same Hospital relationship, OSM–Hospital relationship, and a dedicated capability. | OSM may gain unintended clinical authority or see a Patient in the wrong Hospital. | Confirm OSM authority and exact target predicate. |
| 2 | Can Hospital OWNER and MEMBER both create/submit Screening? | Both currently have direct `patient:read`; profession does not change directory visibility. | `admin`, `doctor`, and `helper` are allowed by legacy UI; no current rewrite clinical rule. | **DENY until selected**; candidate is direct active OWNER/MEMBER with `screening:submit`, subject to owner approval. | Too broad clinical write access, or unusable workflow if only an unavailable role can conduct. | Select OWNER only, OWNER+MEMBER, or another explicit policy. |
| 3 | Does Hospital profession change Screening authority? | Current architecture says profession is classification, not authority by itself. | Legacy role names distinguish doctor/helper but the check is broad and client-side. | No profession distinction unless a concrete rule requires it. | A hidden profession rule may be missed, or profession may become accidental authority. | Confirm whether Doctor/Nurse/Coordinator/Other differ for Screening. |
| 4 | Can Patient self-screen in the first MVP? | `SELF` exists architecturally; Patient clinical UI is deferred. | Inspected Screening pages are staff-facing. | **Defer and deny** in first MVP. | A required Patient journey is blocked or an unsafe self-submission path is invented. | Confirm first-MVP inclusion or explicit future requirement. |
| 5 | Is Screening final on submission or does Hospital review it? | Legacy has no review state and asks for confirmation before save. | Save is presented as non-editable; no review record exists. | **SUBMITTED is final for the first slice**, unless review is a real requirement. | Wrong finality can make correction or clinical governance impossible. | Confirm immediate-final versus review-gated lifecycle. |
| 6 | Can a submitted Screening be corrected? | No rewrite or legacy correction contract exists. | Legacy has no edit route and says it cannot be edited retrospectively. | Exclude correction from first slice; never overwrite silently. | Data errors may remain uncorrectable, or an unsafe overwrite may destroy history. | Confirm whether correction is needed and by whom. |
| 7 | If correction exists, amendment/new revision or overwrite? | Health-related historical data and transaction baseline favor preservation. | Legacy creates new events but does not implement correction semantics. | **Amendment/new revision preserving original**. | Overwrite destroys the historical record and weakens auditability. | Confirm revision visibility, reason, and current-version semantics. |
| 8 | Is the legacy PAM questionnaire still accepted? | No current questionnaire specification or legacy question seed is present. | Active `screening_questions` rows are loaded dynamically; UI says five PAM questions. | Do not implement until the exact question set/version is approved. | Wrong wording, count, or scale makes historical results clinically incomparable. | Approve questionnaire, wording, count, answer scale, and requiredness. |
| 9 | Is the legacy PROMs questionnaire still accepted? | Same evidence limitation as PAM. | Active rows are loaded dynamically; UI says four PROMs questions. | Do not implement until the exact PROMs set/version is approved. | Wrong PROMs content or scale can produce invalid classification. | Approve questionnaire, wording, count, answer scale, and requiredness. |
| 10 | Is the legacy PAM/PROMs scoring formula valid? | Only client code exists; it contains threshold and persistence inconsistencies. | PAM ≤5, PROMs min ≤2, PROMs total ≤8, then combined percentage thresholds. | **Do not accept formula by code existence**; use server scoring only after approval. | Incorrect clinical classification may drive unsafe downstream decisions. | Confirm formula, edge cases, rounding, missing answers, and output meaning. |
| 11 | Are L1–L4 classifications still valid? | Current docs do not define clinical levels. | Legacy uses L1–L4 internally and stores label variants. | Treat as unconfirmed; do not expose or persist as authoritative until approved. | Users may interpret an obsolete level as current clinical guidance. | Confirm level vocabulary and exact semantics. |
| 12 | Are Red/Yellow/Green Zones still valid? | Current docs do not define Zones. | Legacy computes L3/Yellow but profile persistence can map it to Green. | Treat as unconfirmed; no Zone capability or workflow until approved. | A contradictory Zone can mis-prioritize care or mislead operators. | Confirm Zone vocabulary, mapping, and display/behavior. |
| 13 | Is confidence score / improvement plan required? | No current requirement; legacy UI defaults score to 0 and allows free text. | Saves `confidence_score` and `confidence_improvement_plan` with each Screening. | Exclude or make optional until explicitly specified; if accepted, validate and protect narrative. | Missing data may be mistaken for zero, or sensitive narrative may leak. | Confirm requiredness, scale, meaning, visibility, and retention. |
| 14 | Does Screening automatically create Goals? | Current Phase 6 explicitly deferred Goals; no current coupling requirement. | `createDefaultGoals()` runs after every successful save and may archive/insert Goals. | **No automatic Goal creation**; keep domains independent. | Hidden side effects create or change care plans without explicit consent or atomic policy. | Confirm independent Goal/Care Plan workflow or explicit coupling. |
| 15 | Are measurements part of Screening or separate? | Rewrite has no Measurement domain; legacy form does not submit measurements. | Patient detail/follow-up displays weight, height, BMI, waist, blood sugar, HbA1c. | Keep separate/deferred; do not create a universal observation model. | Embedding measurements creates unclear units, history, ownership, and privacy rules. | Decide whether any named measurement is a Screening input and define it. |
| 16 | What result/details may OSM see? | OSM assignment is operational only; no clinical projection policy exists. | Legacy OSM sees broad Patient detail and Screening content through role check. | Least privilege: result summary only until raw responses/narrative visibility is approved. | OSM may see more health data than required for field work. | Define OSM history/detail projection and redaction. |
| 17 | What result/details may Hospital users see? | Direct Patient read does not imply clinical read. Profession authority is unresolved. | Legacy Hospital-like roles see full Screening responses and profile details. | Minimum result/status/date/conductor projection; raw responses only after explicit approval. | Hospital MEMBER or profession may receive excessive or insufficient clinical data. | Define OWNER/MEMBER/profession-specific projections. |
| 18 | Should routine Screening reads be audited? | Existing B6.1/B6.2 routine reads are not automatically audited; mutations are audited. | Legacy code logs browser debug details and does not implement bounded application audit. | Do not add read audit automatically; audit submission/amend/review state changes. | Under-auditing may violate governance; over-auditing may create sensitive access logs and cost. | Confirm read-audit requirement, metadata, retention, and access. |
| 19 | Must historical results preserve question/scoring versions? | Reproducibility is required for health-related historical results; legacy has no version fields. | Questions are loaded by active type/order and history recomputes a total from current response rows. | **Require recoverable `questionSetVersion` and `scoringVersion`**. | A later question/formula change can make old results impossible to explain. | Confirm retention and whether controlled code/seed definitions are sufficient. |
| 20 | Is separate `occurredAt` / backdating required? | Legacy uses `screening_date`; rewrite has no event-time contract. | Client writes a database date and does not expose an explicit occurrence workflow. | Use server `submittedAt` as the MVP assessment time; do not trust arbitrary client time. | Field assessments entered later may need their actual occurrence time, or backdating may falsify history. | Confirm whether a validated occurred-at field and correction policy are needed. |

## 21. Proposed Phase 7B slices

The following decomposition is conditional. No slice is marked
`IMPLEMENTATION READY` while the blocking owner decisions remain open.

### Phase 7B.1 — Screening Core Submission

**Status:** `NOT IMPLEMENTATION READY`

Implement only after the owner confirms:

- authorized conductor classes and exact Hospital/OSM scope;
- approved PAM/PROMs question set and required-answer rules;
- clinically/business-approved scoring formula and output vocabulary;
- question-set/scoring version strategy;
- no-draft versus draft lifecycle;
- result visibility and sensitive-data projection;
- audit events and duplicate-submission/idempotency behavior.

Scope after approval:

```text
one authorized PatientHospitalRelationship
  → one complete submitted Screening
  → validated Responses
  → server-calculated, versioned result
  → atomic success audit
```

No Goals, Measurements, review, correction, or Patient self-service should be
included in this slice unless separately accepted.

### Phase 7B.2 — Screening History / Detail

**Status:** `NOT IMPLEMENTATION READY`

This slice depends on B7.1 and requires the owner to approve the history list
and detail projection for Hospital and, if enabled, OSM. It should provide the
relationship-scoped timeline and minimal detail route without expanding the
Patient directory projection.

If the owner wants the smallest coherent web MVP, B7.1 and B7.2 may be shipped
as one implementation slice after their contracts are closed.

### Phase 7B.3 — Review / Correction

**Status:** `OPTIONAL; DEFERRED / NOT IMPLEMENTATION READY`

Create this slice only if review or correction is confirmed. It should add the
smallest explicit state transition or amendment operation, preserve original
submitted data, enforce a separate capability, and audit the successful local
transaction. If immediate-final immutable submission is accepted, omit B7.3.

## 22. Explicitly deferred boundaries

Phase 7A does not implement or accept the following as Screening requirements:

- Screening Prisma models, migrations, persistence, Server Actions, Route Handlers, or UI.
- Generic questionnaire builder, arbitrary survey engine, generic rules engine, or workflow engine.
- Unconfirmed PAM/PROMs questionnaire wording, formula, L1–L4 meaning, Zone meaning, priority, or intensive-care flag.
- Patient self-screening portal or Patient clinical self-service.
- Routine Platform Admin Screening operation.
- Parent/child/network Hospital Screening scope.
- OSM clinical authority derived from role, relationship, or assignment alone.
- Measurements, HbA1c, blood pressure, weight, height, BMI, waist circumference, or a universal clinical observation model.
- Automatic Goals, Care Plans, appointments, follow-up, notes, referrals, dashboards, or clinical reporting.
- Patient profile editing, lifecycle/delete/archive, transfer, merge, or Hospital change.
- Review, correction, amendment, overwrite, and medical-record state machine until explicitly decided.
- Read auditing unless separately confirmed.
- `/api/v1`, native mobile API, LIFF, notifications, Redis, queues, workers, background jobs, or offline synchronization.
- FHIR, HL7, terminology services, external clinical integrations, and generic healthcare frameworks.

## 23. Risks and implementation constraints

### 23.1 Clinical rule risk

The largest blocker is not the persistence shape; it is whether the legacy
questionnaire and formula are still clinically/business valid. Code presence is
not clinical approval. Do not use a legacy threshold as a “temporary” result in
production without owner confirmation.

### 23.2 Authorization risk

The existing assignment contract makes it easy to accidentally treat an OSM's
operational access as clinical authority. Screening policy must have its own
capability and target predicate. Hospital direct membership and current
`patient:read` must not automatically grant Screening read/write.

### 23.3 Historical reproducibility risk

Without question-set and scoring versions, a future formula or wording change
can make a historical result impossible to explain. Version identifiers are a
small, reversible contract compared with reconstructing old results later.

### 23.4 Duplicate event risk

A Screening is repeatable by design, so a database uniqueness rule on Patient
and date would be wrong. The future service needs a bounded request-level
idempotency behavior that distinguishes a retried submission from a new
assessment.

### 23.5 Sensitive projection risk

The legacy Patient detail page exposes broad profile, identity, measurement,
and clinical data. The rewrite must keep Screening projections separate from
the B6.1/B6.2 directory and must define OSM/Hospital detail visibility before
rendering raw responses or narratives.

### 23.6 Scope and time risk

The proposed first slice uses server submission time and one Hospital context.
Backdated field assessments, offline capture, drafts, review, and amendments
would change lifecycle and idempotency semantics and must be explicitly added.

### 23.7 ADR and documentation decision

No new ADR is created in Phase 7A. The document contains proposed contracts and
open owner decisions only; no accepted architectural boundary has changed. An
ADR is appropriate later only if an owner-accepted Screening decision becomes a
cross-module, security/privacy, data-integrity, or difficult-to-reverse
architectural boundary not already covered by ADR-0001/0002/0005/0006.

## 24. Acceptance criteria

Phase 7A is complete as a requirements-discovery artifact when all of the
following are true:

- The document explicitly defines Screening as an assessment/submission/result boundary and excludes unrelated clinical domains.
- Current Person/User, ActorContext, server-side authorization, direct Hospital scope, PatientHospitalRelationship, OSM assignment, and Platform Admin invariants are preserved.
- Legacy Screening pages and query functions are classified as legacy evidence or architecture-conflicting behavior rather than silently promoted to requirements.
- PAM/PROMs question counts, answer scales, threshold behavior, output mappings, completeness behavior, and inconsistencies are recorded for owner review.
- Server-side deterministic scoring and non-authoritative browser results are explicit.
- Historical question/scoring version recovery is addressed without a generic questionnaire or rules engine.
- Lifecycle, history, finality, review, and correction/amendment semantics are separated and unresolved items are visible.
- Measurements and Goal/Care Plan coupling are explicitly bounded or deferred.
- Capability vocabulary is minimal and unsupported authority defaults to deny.
- The transaction boundary includes raw responses, canonical result/version, and successful mutation audit, while excluding unrelated operations.
- Screening data is classified as sensitive and projections/audit metadata exclude raw identity, authentication/provider, secret, and full clinical payload convenience logging.
- Conceptual route/projection boundaries reuse current relationship-scoped navigation and mobile-friendly shell patterns.
- The owner decision table contains evidence, legacy behavior, recommended default, risk, and the exact decision needed.
- No product code, schema migration, generated file, or speculative transport infrastructure was added.

### Phase 7B readiness conclusion

Phase 7B is **not implementation-ready**. The exact blockers are:

1. Which actor classes may `screening:submit` and `screening:read`, especially OSM and Hospital OWNER/MEMBER/profession boundaries.
2. Whether Patient self-screening is excluded from the first MVP.
3. The approved PAM/PROMs question sets, answer completeness, wording/version, and whether confidence is part of the contract.
4. The approved scoring formula and the validity/meaning of L1–L4 and Red/Yellow/Green outputs.
5. Immediate-final versus review-gated submission, and whether correction is needed.
6. If correction is needed, amendment/revision semantics and authority.
7. Approved Hospital/OSM result and response visibility.
8. Confirmation that version identifiers and server-defined question/scoring definitions are required and sufficient.

Measurements, Goals/Care Plans, automatic side effects, Patient self-service,
Admin routine operation, network scope, and generic clinical infrastructure are
explicitly deferred rather than blockers for the conservative first slice.

No update was made to `PRODUCT.md`, `docs/CONTEXT.md`, the architecture
baseline, or the ADR set because Phase 7A did not introduce an owner-accepted
architectural decision.
