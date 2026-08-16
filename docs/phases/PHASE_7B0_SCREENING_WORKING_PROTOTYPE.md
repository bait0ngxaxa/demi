# Phase 7B.0 — Screening Working Prototype / Requirement Validation

- **Status:** `IMPLEMENTED FOR REQUIREMENT VALIDATION`
- **Date:** 2026-08-16
- **Relationship to Phase 7A:** Phase 7A remains `ANALYSIS COMPLETE`; its unresolved clinical and business decisions are not accepted by this prototype.
- **Purpose:** Provide a real, safe, relationship-scoped Screening workflow for hands-on customer validation before Phase 7B production hardening.

Phase 7B.0 implements reusable application architecture, persistence,
authorization, server-side scoring, history, audit, and a mobile-friendly web
workflow. The questionnaire wording, legacy-style scoring, actor policy, and
immediate-final lifecycle are prototype decisions for requirement validation.
They must not be described as the final clinical contract merely because the
workflow is executable.

## 1. Prototype boundary

The prototype supports this path:

```text
authorized Hospital or assigned OSM
  → PatientHospitalRelationship
  → Screening history
  → complete PAM + PROMs + Confidence form
  → server validation and scoring
  → atomic persistence and audit
  → result and historical detail
```

It does not create a generic questionnaire platform or a general clinical
record container. Screening is one submitted assessment event belonging to one
`PatientHospitalRelationship`.

The accepted Phase 5/6 boundaries remain unchanged:

- `Person` and `User` remain separate concepts.
- Authentication and ActorContext are resolved on the server.
- `Role + Capability + Scope + Target Resource` remains the authorization model.
- Browser state is never authorization evidence.
- Parent/child Hospital hierarchy does not expand Patient or Screening scope.
- `patient:read` does not imply `screening:read`.
- `PatientOsmAssignment` remains operational scope; this prototype explicitly
  grants Screening capability on top of an exact active assignment for
  requirement validation.
- Platform `ADMIN` is not a routine Screening operator.

## 2. Implemented capability and scope contract

Phase 7B.0 adds only:

```text
screening:read
screening:submit
```

| Actor | Prototype permission | Server scope required | Result |
| --- | --- | --- | --- |
| Hospital `OWNER` | Read + submit | Active direct membership in the target Hospital and matching `PatientHospitalRelationship` | Allowed |
| Hospital `MEMBER` | Read + submit | Same as `OWNER` | Allowed |
| Hospital profession | No separate effect | `DOCTOR`, `NURSE`, `COORDINATOR`, and `OTHER` do not change the prototype decision | Same authority as membership |
| `OSM` | Read + submit | Active OSM account, active OSM–Hospital relationship, active assignment to the exact target relationship, and active target Hospital | Allowed only when all predicates hold |
| `PATIENT` | None | Patient self-screening is deferred | Denied |
| Platform `ADMIN` | None | No routine clinical bypass | Denied |

The service reloads the target relationship, Hospital status, Patient role,
actor status, actor roles, direct memberships, OSM relationships, and active
assignment inside the application boundary. A stale or ambiguous state fails
closed. Hospital context supplied by a URL is only an opaque lookup reference;
the authoritative Hospital is resolved from the relationship.

## 3. Source-defined questionnaire registry

Question definitions are typed source code, not database rows. The prototype
registry is under:

- [Question set types](../../src/modules/screening/domain/question-sets/types.ts)
- [Legacy prototype v1 questions](../../src/modules/screening/domain/question-sets/legacy-prototype-v1.ts)
- [Question set registry](../../src/modules/screening/domain/question-sets/index.ts)

The persisted identifiers are:

```text
questionSetKey     = demi-screening
questionSetVersion = legacy-prototype-v1
scoringVersion     = legacy-prototype-v1
```

The definitions are treated as immutable once a Screening has used them. A
future wording or scoring change must add a new source definition instead of
editing this one silently. Persisted version identifiers are implemented for
prototype reproducibility; owner acceptance of the minimal versioning contract
is still pending under Phase 7A.

### Temporary Thai mock wording

The prototype uses neutral temporary Thai wording to make the workflow usable:

- 5 PAM-style questions with values `1–4`.
- 4 PROMs-style questions with values `1–6`.
- All nine answers are required.
- Confidence score is `0–10`.
- Confidence improvement plan is optional, validated to 1,000 characters, and
  treated as sensitive free text.

The UI displays this notice:

> ต้นแบบเพื่อเก็บ Requirement
>
> ข้อคำถามและเกณฑ์การประเมินในหน้านี้เป็นต้นแบบอ้างอิงรูปแบบจากระบบ DEMI เดิม และยังไม่ใช่ข้อกำหนดทางคลินิกฉบับสุดท้าย

The exact wording, answer labels, requiredness, and clinical validity remain
customer decisions. No question editor, seed operation, or question database
was added.

## 4. Provisional scoring behavior

The implementation in
[legacy prototype scoring](../../src/modules/screening/domain/scoring/legacy-prototype-v1.ts)
uses the requested legacy-style algorithm only to make customer validation
possible:

```text
pamTotal  = sum(all 5 PAM answers)
promsTotal = sum(all 4 PROMs answers)
promsMin  = minimum(all 4 PROMs answers)

if pamTotal <= 5:
  L1 / RED
else if promsMin <= 2:
  L1 / RED
else if promsTotal <= 8:
  L1 / RED
else:
  combinedTotal = pamTotal + promsTotal
  percentage = combinedTotal / 44 * 100

  if percentage >= 75: L4 / GREEN
  else if percentage >= 50: L3 / YELLOW
  else: L2 / GREEN
```

`L1`–`L4`, `RED`, `YELLOW`, and `GREEN` are canonical prototype values. Legacy
display labels such as `Deny`, `General`, `Intensive`, and `Champion` are not
persisted. The result does not trigger treatment, care recommendations, or
Goals.

The browser sends raw answers only. The server resolves the source definitions,
validates exact question membership and ranges, recalculates totals and
classification, and persists the canonical result. Client-supplied totals,
percentage, level, Zone, conductor, Hospital, or assignment values are rejected
or ignored by the transport boundary.

## 5. Persistence and historical boundary

The Prisma model [ScreeningAssessment](../../prisma/schema.prisma) is one small
first-class aggregate with validated JSON snapshots:

```text
id
patientHospitalRelationshipId
conductedByUserId
submissionNonce
questionSetKey
questionSetVersion
scoringVersion
responses Json
result Json
submittedAt
createdAt
```

`responses` contains the ordered PAM/PROMs answer maps and Confidence fields.
`result` contains only the typed derived result. Both payloads are validated
with runtime schemas before persistence and again when read. There is no
generic normalized questionnaire schema.

The [migration](../../prisma/migrations/20260816130000_screening_working_prototype/migration.sql)
uses `Restrict` for the historical assessment's Patient relationship and
conductor User foreign keys. The prototype does not add Patient delete,
archive, transfer, or lifecycle behavior.

History is relationship-scoped and newest-first. The list projection contains
only opaque assessment ID, date/time, submitted status, conductor display name,
PAM total, PROMs total, level, and Zone. Detail is available only after the
same relationship-scoped read policy succeeds and includes the validated
answers, Confidence fields, result, and source versions. Screening data is
sensitive application data and is not added to the Patient Directory
projection.

## 6. Submission transaction, retry, and audit

The submission service follows the existing application boundary:

```text
Server Action
  → ActorContext
  → Screening application service
  → authoritative relationship/actor scope reload
  → exact response validation
  → source-defined server scoring
  → ScreeningAssessment write
  → bounded audit write
```

The write and `screening.submitted` audit event are one serializable local
transaction. A successful response is not returned if either write fails.

Screenings remain legitimately repeatable. The implementation does not impose
uniqueness by Patient, date, score, or relationship. It uses a per-form opaque
`submissionNonce` as a bounded implementation mechanism:

- retrying the same accepted nonce and identical payload returns the existing
  assessment without creating another event or audit row;
- reusing the nonce with changed payload or scope is rejected;
- a deliberate later assessment uses a new nonce and is allowed.

The nonce is an implementation choice, not a new clinical/business contract or
generic idempotency platform.

The only required prototype mutation audit is:

```text
action:       screening.submitted
resourceType: ScreeningAssessment
metadata:     opaque IDs + questionSetVersion + scoringVersion
```

Audit metadata excludes raw answers, Confidence narrative, National ID, HN,
Patient name, authentication/provider data, tokens, and secrets. Routine
Screening reads are not audited in this prototype.

## 7. Routes and customer-demo workflow

The implemented relationship-scoped routes are:

```text
/app/patients/[relationshipId]/screenings
/app/patients/[relationshipId]/screenings/new
/app/patients/[relationshipId]/screenings/[screeningId]
```

The existing Patient detail page links to Screening history. The form is
responsive for phone/tablet field use and contains:

1. prototype notice, Patient summary, and Hospital context;
2. PAM section with five required question groups;
3. PROMs section with four required question groups;
4. Confidence score and optional bounded plan;
5. completion counter and answer review before submit;
6. server error feedback and result navigation.

The result/detail page shows the submitted date/time, conductor display name,
raw recorded answers, Confidence, canonical totals, level, Zone, percentage
where applicable, and source versions. It does not show treatment instructions
or automatic care recommendations.

There are no persisted drafts, Review state, approval, correction, amendment,
or submitted-assessment editing in Phase 7B.0. A submitted assessment is
historical and is never silently overwritten.

## 8. Tests and validation coverage

Focused tests cover:

- source registry counts, stable keys, scales, and unknown-version failure;
- scoring threshold boundaries, including 50% and 75%;
- missing, extra, duplicate, and out-of-range answers;
- rejection of browser-supplied canonical result fields;
- Hospital OWNER/MEMBER, profession-neutral, wrong Hospital, inactive state,
  OSM assignment, Patient, and Admin policy decisions;
- transactional submission, canonical persistence, bounded audit, same-retry
  deduplication, changed-payload nonce conflict, and deliberate repeat event;
- relationship-scoped history/detail projections and nullable Confidence plan;
- PostgreSQL integration coverage for Hospital isolation, OSM assignment scope,
  persistence, history, audit, and retry behavior.

The prototype must be validated with the repository's normal commands:

```text
npx prisma validate
npx prisma generate
npm run typecheck
npm run lint
npx vitest run src/modules/screening
npm run test:integration:local
```

## 9. Explicitly deferred

The following remain outside this prototype:

- Patient self-screening and Patient clinical self-service;
- Platform Admin routine Screening operation or clinical bypass;
- persisted drafts, review, correction, amendment, overwrite, or approval;
- final PAM/PROMs wording, accepted questionnaire, clinical scoring formula,
  L1–L4 meaning, Zone meaning, and Confidence semantics;
- automatic Goals or Care Plans;
- Measurements, HbA1c, blood pressure, weight, height, BMI, waist circumference,
  appointments, follow-up, referrals, notes, notifications, dashboards, and
  clinical reporting;
- generic questionnaire/rules/workflow engines, FHIR, HL7, terminology systems,
  `/api/v1`, native API, LIFF, ThaID, Redis, queues, workers, offline sync, and
  background jobs;
- read auditing, backdated occurrence time, and offline capture.

## 10. Customer validation checklist

The prototype meeting should explicitly validate:

1. Whether Hospital OWNER and MEMBER should both conduct and read Screening.
2. Whether profession should remain neutral.
3. Whether OSM may conduct/read for actively assigned Patients in the exact
   Hospital relationship.
4. Whether Patient self-screening is excluded from the first production MVP.
5. The PAM/PROMs wording, answer labels, counts, requiredness, and accepted
   questionnaire version.
6. The scoring formula, threshold edges, L1–L4 semantics, and Zone semantics.
7. Whether Confidence score and improvement plan are required, optional, or
   removed, including visibility and retention.
8. Whether submission is immediately final or requires Hospital review.
9. Whether correction is needed and, if so, amendment/revision semantics and
   authority.
10. Which result and raw response fields Hospital users and OSM may see.
11. Whether routine Screening reads require audit.
12. Whether the proposed minimal question-set/scoring version identifiers are
    accepted for the production contract.

Until those decisions are confirmed and Phase 7A is updated, the status is:

```text
Phase 7A — ANALYSIS COMPLETE; clinical contract not finally accepted
Phase 7B.0 — IMPLEMENTED FOR REQUIREMENT VALIDATION
Phase 7B production hardening/final Screening Core — NOT IMPLEMENTATION READY
```
