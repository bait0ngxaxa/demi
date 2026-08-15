# Phase 5B.2 — Patient First-Time Activation

- Status: Implemented MVP vertical slice
- Baseline: `91cdb6583d189d9d2625113d428569a11072baa7`
- Related implementation: [Phase 5B.1 Patient Provisioning Core](./PHASE_5B1_PATIENT_PROVISIONING_CORE.md)
- Architecture references: ADR-0001, ADR-0002, ADR-0004, ADR-0005, ADR-0006, ADR-0007, and the provider consistency pattern from ADR-0008

เอกสารนี้บันทึก implementation ของ Phase 5B.2 เท่านั้น ไม่ได้เปลี่ยนความหมาย
ของ `PatientProfile`, `PatientHospitalRelationship` หรือทำให้ unresolved
requirements กลายเป็น permanent product decision

## 1. Implemented scope

The slice implements:

- Hospital-side Patient activation issuance at the existing
  `/app/patients/provision` handoff surface;
- a Patient-specific `PatientActivation` model and migration;
- one-time opaque activation credentials with expiry, reissue, revocation, and replay protection;
- a public `/activate/patient` page using the existing fragment-token handoff pattern;
- QR and copy-link presentation without storing URL or QR data in PostgreSQL;
- Patient-owned password creation using the existing 12–128 character password policy;
- Supabase Auth provisioning through the existing server-only password-auth boundary;
- local `User.authSubject` mapping and `PROVISIONED → ACTIVE` transition;
- local/provider compensation or reconciliation-safe failure behavior;
- audit events and focused unit/integration/transport coverage.

The slice does not add a Patient roster, clinical workflow, dashboard, recovery
system, or new delivery provider.

## 2. PatientActivation persistence

The migration `20260815110000_patient_first_time_activation` adds:

```text
PatientActivation
  id
  userId
  hospitalId
  tokenHash
  expiresAt
  claimedAt?
  usedAt?
  revokedAt?
  createdByUserId
  createdAt
  updatedAt
```

`hospitalId` binds a handoff to the Hospital relationship for which the link
was issued. This is needed because one Patient may have relationships with
multiple Hospitals. `claimedAt` reserves the credential while provider I/O is
in progress; it is not a separate lifecycle enum.

The database stores only the SHA-256 digest of the raw token. `tokenHash` is
unique, and a partial unique index allows at most one activation per User where
`usedAt IS NULL AND revokedAt IS NULL`. The raw token, URL, QR image, password,
provider subject, and provider alias are not stored in this model.

## 3. Issuance authorization and eligibility

Issuance has its own capability:

```text
patient:activation:issue
```

The reversible MVP policy is centralized in
`src/modules/patient-activation/policies/patient-activation-policy.ts`:

- actor `User.status` must be `ACTIVE`;
- actor must have `Role.HOSPITAL`;
- actor must have an active direct `OWNER` or `MEMBER` `HospitalMembership` to the target Hospital;
- target Hospital must be `ACTIVE`;
- target Patient must have `Role.PATIENT`, a `PatientProfile`, and a
  `PatientHospitalRelationship` to that Hospital;
- target User must be `PROVISIONED` with `authSubject = null`, or already
  `ACTIVE` with a valid existing provider mapping.

The policy is checked from the supplied `ActorContext` and rechecked from the
database inside the serializable transaction. Parent/child Hospital authority,
OSM authority, and browser-selected state do not grant this capability.

An `ACTIVE` mapped Patient returns `ALREADY_ACTIVE`; no activation is created,
the existing provider subject is not replaced, and other roles remain intact.
Unexpected states such as `PROVISIONED` with an `authSubject`, `ACTIVE` without
a valid mapping, or unsupported User status fail closed.

## 4. Issuance, reissue, and handoff

`issuePatientActivation` is transport-independent:

```text
policy check
  → database actor/scope recheck
  → target Patient/User/domain eligibility check
  → find current unused activation
  → revoke it when expired or explicit reissue is requested
  → generate 256-bit random URL-safe token
  → store tokenHash and expiry
  → write audit event
  → return raw token once
```

The default MVP expiry is 24 hours. This is a **REVERSIBLE MVP IMPLEMENTATION
CONSTRAINT**, aligned with the existing copy-link/QR convention; it is not a
permanent Patient business requirement or configuration framework.

When a valid unused activation already exists, a normal issue request returns
`ALREADY_ISSUED` without exposing the raw token again. An explicit reissue
revokes the old row, writes `patient_activation.revoked`, creates a new row,
and returns the new raw token. The old token cannot be claimed after commit.

The Hospital UI shows the activation URL, expiry, QR, copy action, and reissue
action. The URL is built as:

```text
/activate/patient#<opaque-token>
```

The fragment keeps the raw bearer out of the server request path. QR is rendered
from that URL with the existing `qrcode` dependency and no QR domain model is
introduced.

## 5. Public landing and claim flow

The public route `/activate/patient` does not require an existing login. The
browser reads the URL fragment, removes it from the visible history entry, and
asks a server action to validate the token. The public response is either a
minimal safe state or a generic invalid state. Safe display data is limited to
Patient display name, Hospital name, and expiry; it does not expose National ID,
identity hash, User ID, provider identifiers, or medical information.

On submit, the server validates the token again and performs:

```text
hash token
  → serializable conditional claim (`claimedAt`)
  → recheck expiry/revocation/use/User/PATIENT/domain state
  → patient-submitted password validation
  → Supabase Auth identity provisioning
  → local authSubject/status finalization transaction
  → mark activation used
  → write completion audit
  → redirect to `/login?activated=1`
```

The Patient enters both password fields. Hospital staff never receive or set
the password, and the password is not written to any DEMI domain table, audit
metadata, URL, or QR payload.

## 6. Provider interaction and consistency

The current authentication boundary uses the existing opaque provider alias:

```text
<User.id>@auth.demi.internal
```

This is an internal provider login alias, not an invented Patient email or phone
ownership claim. Existing `/login` already resolves the Thai National ID to the
local User and then uses this alias, so Patient activation reuses the confirmed
technical pattern without creating a Patient-specific login system.

Provider calls use `provisionPasswordAuthIdentity`, which creates a confirmed
Supabase Auth password identity and conditionally maps its provider subject to
the local User. PostgreSQL and Supabase Auth are not treated as one distributed
transaction:

- provider failure releases `claimedAt` and leaves the User `PROVISIONED`;
- provider alias conflict or ambiguous provider outcome raises a
  reconciliation-required error and leaves the claim reserved rather than
  blindly retrying;
- provider success followed by local finalization failure detaches the local
  subject, deletes the known provider identity, and releases the claim when
  both compensations succeed;
- if detach/delete/release is ambiguous, the operation fails closed with a
  reconciliation-required error and does not report activation success;
- a provider/local subject mismatch is never silently overwritten.

The service does not add a generic identity-provider abstraction or background
reconciliation worker. The existing server-only auth boundary remains the
replaceable integration point.

## 7. Concurrency and replay behavior

Claim uses a serializable transaction plus a conditional update requiring:

```text
claimedAt IS NULL
usedAt IS NULL
revokedAt IS NULL
expiresAt > now
```

Only one concurrent submit can reserve the activation. Double click, a second
tab, a second QR scan, and a used/revoked/expired/unknown token receive a safe
invalid/conflict result. No second provider provisioning call is made after a
claim loses the race.

The final local transaction checks the exact claim timestamp, activation
Hospital, current provider mapping, User status, PATIENT role, PatientProfile,
and Hospital relationship before setting `User.status = ACTIVE`. It then marks
`usedAt` and records the completion audit in the same local transaction.

## 8. Account lifecycle post-conditions

For a new Patient:

```text
User.status: PROVISIONED → ACTIVE
User.authSubject: null → valid provider subject
PATIENT role: preserved
other User roles: preserved
PatientProfile: unchanged
PatientHospitalRelationship: unchanged
PatientActivation.usedAt: set
```

Activation does not transition or invent a lifecycle state for PatientProfile
or PatientHospitalRelationship. An existing `ACTIVE` multi-role User does not
receive a new provider identity, password reset, or activation record.

## 9. Audit

The implementation writes the following events using current audit validation:

- `patient_activation.issued`
- `patient_activation.revoked`
- `patient_activation.completed`

Audit metadata is bounded and may identify the target Hospital, PatientProfile,
User lifecycle outcome, and source. It never contains raw token, tokenHash,
password, National ID, phone, email, provider secret, provider alias, or
provider subject.

## 10. Tests and validation

Focused coverage includes:

- active Hospital member issuance and all required inactive/unrelated/relationship checks;
- already-active and unexpected User/auth mapping states;
- token digest-at-rest, expiry, reissue, revocation, and replay prevention;
- successful status/mapping completion with role/profile/relationship preservation;
- unknown, expired, revoked, and used credentials;
- provider failure, provider/local compensation, and retry-safe claim release;
- concurrent claim protection and single provider invocation;
- transport validation, safe public details, already-active UI result, QR/link result, and password confirmation.

Commands run for this slice:

```text
npx prisma validate       PASS
npx prisma generate       PASS
npm run lint              PASS
npm run typecheck         PASS
npm test                  PASS (31 files, 156 tests)
npm run test:integration  PASS (6 files, 69 tests; wrapper run before the final regression-test additions)
integration Vitest current PASS (6 files, 70 tests)
```

One later wrapper rerun stopped before test execution because an already-running
local `next dev` process held the Prisma Windows query-engine DLL during its
`prisma generate` step (`EPERM` on rename). The current integration Vitest
configuration and code were rerun directly against the already-generated
client and passed.

## 11. Explicitly deferred and reversible constraints

The following remain out of scope:

- Patient dashboard, profile edit, list-management, read/update/delete capability framework;
- clinical records, screening, HbA1c, care plans, appointments, and PAM;
- OSM-to-Patient assignment and OSM activation issuance;
- OTP, SMS, email verification, ThaID, LIFF, and delivery-provider integration;
- password reset redesign, account recovery, CAPTCHA, and new rate-limit infrastructure;
- generic IAM/provider abstraction, workflow engine, queue, Redis, and background jobs.

The 24-hour expiry, direct Hospital `OWNER`/`MEMBER` eligibility, fragment URL
presentation, and existing internal provider alias are implementation choices
that can be replaced at the policy/transport/integration boundary. Abuse
protection beyond the existing application boundary remains deferred and must
be added before broader public exposure.
