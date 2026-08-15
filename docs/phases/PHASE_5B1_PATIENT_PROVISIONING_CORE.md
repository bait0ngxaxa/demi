# Phase 5B.1 — Patient Provisioning Core

- Status: Implemented MVP vertical slice
- Contract: [Phase 5A Patient Provisioning](./PHASE_5A_PATIENT_PROVISIONING.md)
- Architecture references: ADR-0001, ADR-0002, ADR-0004, ADR-0005, ADR-0006, and ADR-0007

เอกสารนี้เป็น implementation handoff ของ Phase 5B.1 เท่านั้น ไม่ได้เปลี่ยน
accepted architecture หรือทำให้ product decision ที่ยังไม่ยืนยันกลายเป็นถาวร

## 1. Implemented scope

The slice implements:

- single patient provisioning at `/app/patients/provision`;
- Hospital Excel `.xlsx` upload, validation, preview, confirmation, and result summary;
- one transport-independent `PatientProvisioningService` used by both flows;
- identity reuse through the existing identity namespace and HMAC lookup;
- `PATIENT` role assignment while preserving all existing roles;
- `PatientProfile` and `PatientHospitalRelationship` persistence;
- the `patient:provision` server-side policy boundary;
- atomic success audit events and bounded retry/concurrency protection.

Patient activation, credentials, clinical data, patient read/update/delete, OSM
assignment, queues, workers, and background jobs are explicitly out of scope.

## 2. Persistence shape

The migration `20260815090000_patient_provisioning_core` adds:

```text
Person
  1 ── 0..1 PatientProfile
                1 ── many PatientHospitalRelationship ── 1 Hospital
```

`PatientProfile` contains only its UUID, the unique `personId`, and timestamps.
`PatientHospitalRelationship` contains its UUID, `patientProfileId`, `hospitalId`,
optional `hospitalNumber`/HN, and timestamps.

The relationship has a database uniqueness constraint on
`(patientProfileId, hospitalId)`. HN is optional, is not placed on `Person`, and
is not globally or per-Hospital unique in this phase. The schema supports multiple
Hospital relationships for one patient; no one-Hospital invariant was added.
No patient-domain lifecycle enum was invented for this slice.

## 3. Single provisioning flow

The form accepts only:

```text
Thai National ID
First name
Last name
HN (optional)
```

The target Hospital is selected from server-resolved scopes. A browser-selected
Hospital is only an input and is rechecked by both the policy and the database
guard.

The application service performs, in one serializable local transaction:

```text
authorize patient:provision
  → validate normalized input
  → resolve/reuse Person
  → resolve/reuse User
  → add UserRole.PATIENT without removing roles
  → create/reuse PatientProfile
  → create/reuse PatientHospitalRelationship
  → write patient.provisioned AuditEvent when state changed
```

The service accepts the generic normalized identity input used by the identity
module. Thai National ID is a current UI/Excel adapter choice, not the domain's
permanent identity model.

## 4. Authorization contract

The only new capability is:

```text
patient:provision
```

The temporary MVP policy is centralized in
`src/modules/patient-provisioning/policies/patient-provisioning-policy.ts`:

- a Hospital actor needs `Role.HOSPITAL`, an active direct `OWNER` or `MEMBER`
  membership, and an active target Hospital;
- an OSM actor needs `Role.OSM`, an active `OsmHospitalRelationship`, and an
  active target Hospital;
- bulk import requires the direct Hospital scope and is not available to OSM;
- parent/child Hospital metadata, profession, patient ownership, patient read
  access, and clinical authority do not grant this capability;
- inactive or ambiguous actor, relationship, or Hospital context fails closed.

The service reloads the actor's relevant database state inside the transaction,
so ActorContext and browser scope are not the final authority. The direct
Hospital `OWNER`/`MEMBER` choice is intentionally a replaceable policy decision,
not a new permanent RBAC framework.

## 5. Identity and lifecycle behavior

Identity resolution uses the existing HMAC namespace. An existing identity never
creates a second `Person` or `User`; an existing `User` keeps every existing role
and auth mapping. A new User is `PROVISIONED`. An existing valid `ACTIVE` User
remains `ACTIVE`; no activation or reactivation is triggered.

The implementation fails closed for conflicting names, conflicting HN on the
same Patient-Hospital relationship, invalid existing account state, and partial
or ambiguous patient-domain state. It does not use name, birth date, phone, or HN
as a weak identity match and it does not silently overwrite authoritative values.

## 6. Excel flow

`excel-patient-import-adapter.ts` owns only the adapter boundary:

```text
Excel row → normalized ProvisionPatientInput or safe row validation result
```

The supported columns are Thai National ID, First name, Last name, and optional
HN. The Hospital is derived from the authorized server scope and is not accepted
from the file. The adapter accepts `.xlsx` only, limits files to 5 MB and 500
non-header rows, masks National ID in preview output, and does not expose raw
identity values or infrastructure errors.

`next.config.ts` sets the Server Action request limit to 6 MB so the 5 MB file
limit still has room for multipart request overhead.

The flow is:

```text
upload → parse → normalize → validate → preview → confirm → service per row → summary
```

Preview classifications are `READY`, `ALREADY_EXISTS`, `DUPLICATE_IN_FILE`,
`INVALID`, and `CONFLICT`. Confirmed rows are processed sequentially through the
same patient service. Each row has its own transaction, so an unrelated failure
does not roll back successful rows. The returned summary distinguishes imported,
already-existing, invalid, conflict, and failed rows.

ExcelJS is used for `.xlsx` parsing. No queue, worker, Redis, or background-job
infrastructure was introduced.

## 7. Atomicity, idempotency, and concurrency

The database transaction includes Person/User/role/profile/relationship and the
successful provisioning audit event. A failure rolls back all authoritative
patient state for that operation.

The `(patientProfileId, hospitalId)` database constraint is the final duplicate
guard. The service uses serializable transactions with a bounded retry for
serialization and unique-conflict races. An exact repeat for the same identity
and target relationship returns `ALREADY_PROVISIONED` without creating duplicate
identity, role, profile, relationship, or audit rows.

## 8. Tests

Added coverage includes:

- policy unit tests for Hospital, OSM, inactive, and bulk boundaries;
- PostgreSQL integration tests for new and reused identities, role preservation,
  lifecycle behavior, idempotency, policy denial, identity/HN conflicts,
  rollback, atomic audit, concurrency, Excel preview classification, partial
  import results, and bulk authorization.

The verification commands completed for this handoff are:

```text
npx prisma validate       passed
npx prisma generate       passed
npm ci --dry-run          passed
npm run lint              passed
npm run typecheck         passed
npm test                  25 files / 135 tests passed
npm run test:integration  5 files / 50 tests passed
```

The integration command applies all five migrations to the local PostgreSQL
database before running the integration suite. A prior full-suite run had one
non-reproducible failure in an unrelated platform-admin compensation test; the
isolated test and subsequent full integration run both passed, so no unrelated
application code was changed.

The ExcelJS dependency is pinned with an `uuid@11.1.1` override because the
parser only uses the `uuid.v4` API and the older transitive UUID release had a
known advisory. The remaining production audit report contains one pre-existing
high advisory in the Next/PostCSS toolchain (`nanoid`); it is outside this
feature's dependency path and was not changed with a broad audit fix.

## 9. Deferred requirements and reversible constraints

The following remain intentionally deferred: patient activation/token/OTP/email/
SMS/ThaID/LIFF/password setup; patient read/update/delete/restore/transfer;
parent/child authority; OSM patient assignment; clinical records and workflows;
HN uniqueness; one-Hospital cardinality; demographic expansion; alternative
identity types; and batch job infrastructure.

The MVP temporarily accepts direct active Hospital members (`OWNER` or `MEMBER`)
for Hospital provisioning, restricts bulk import to Hospital scopes, uses Thai
National ID in the current adapters, and keeps HN optional. These choices live in
the policy, validation, adapter, and service boundaries so they can be changed
without coupling unrelated patient persistence or activation behavior.
