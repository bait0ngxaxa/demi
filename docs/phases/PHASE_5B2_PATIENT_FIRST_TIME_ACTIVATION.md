# Phase 5B.2 — Patient First-Time Activation

- Status: Implemented hardening MVP
- Baseline: `1637fc28540da901fb5b212f1f1f4e7b2ee1ac53`
- Related implementation: [Phase 5B.1 Patient Provisioning Core](./PHASE_5B1_PATIENT_PROVISIONING_CORE.md)
- Architecture references: ADR-0004 and the provider consistency pattern from ADR-0008

เอกสารนี้บันทึก implementation ของ Patient activation เท่านั้น ไม่ได้เปลี่ยน
ความหมายของ `PatientProfile`, `PatientHospitalRelationship` หรือทำให้ unresolved
requirements กลายเป็น permanent product decision

## 1. Domain boundary and optional activation

Patient provisioning and Patient activation are independent operations:

```text
provisioning
  → Person / User / PATIENT / PatientProfile / PatientHospitalRelationship
  → User may remain PROVISIONED indefinitely

explicit Hospital activation action
  → one activation credential
  → Patient-owned password
  → User.authSubject + User.status = ACTIVE
```

Single Patient provisioning does not issue an activation. The provisioning result
only reports the account state and may link to `/app/patients/activation`.
Excel import is provisioning-only: it creates no `PatientActivation`, token, URL,
QR result, or raw activation token. This is intentional; the Hospital activates
only Patients who actually need interactive DEMI access.

Activation does not change `PatientProfile` or
`PatientHospitalRelationship`. Existing roles are preserved.

## 2. Persistence

`PatientActivation` is Patient-specific and is not shared with
`WorkforceActivation`:

```text
PatientActivation
  id
  userId
  hospitalId
  tokenHash
  expiresAt
  claimedAt?
  claimExpiresAt?
  reconciliationRequiredAt?
  usedAt?
  revokedAt?
  createdByUserId
  createdAt
  updatedAt
```

Migration `20260815130000_patient_activation_claim_hardening` adds the bounded
claim lease and reconciliation marker to the existing Patient activation table.
The existing unique token hash and partial unique index continue to prevent more
than one non-used/non-revoked activation for a User. A claimed or
reconciliation-required row therefore still blocks unsafe replacement.

Only the SHA-256 digest of the opaque token is stored. The database never stores
the raw token, activation URL, QR image/data URL, password, provider alias, or
provider secret.

## 3. Issuance policy and dedicated query boundary

The issuance capability is separate from provisioning:

```text
patient:activation:issue
```

The reversible MVP policy is centralized in
`src/modules/patient-activation/policies/patient-activation-policy.ts` and is
rechecked against PostgreSQL for every mutation:

- actor User is `ACTIVE`;
- actor has `Role.HOSPITAL`;
- actor has a direct active `OWNER` or `MEMBER` `HospitalMembership`;
- target Hospital is `ACTIVE`;
- target Patient has `PATIENT`, `PatientProfile`, and a relationship to that Hospital.

OSM, parent/child Hospital authority, geography, patient ownership, and clinical
scope do not grant this capability.

The protected `/app/patients/activation` route is a narrow Activation Actions
surface, not a general Patient management page. Its query boundary supports:

- exact Thai National ID lookup through the existing HMAC identity-resolution
  infrastructure;
- exact HN lookup constrained to the selected Hospital;
- a bounded result set of at most 25 matches, so duplicate HN values are handled
  as multiple candidates rather than treated as unique.

The projection contains only User/Profile identifiers needed by the activation
action, display name, HN, account status, derived activation status, expiry, and
whether issue/reissue is currently possible. It does not return raw National ID,
`identityKeyHash`, provider subject/alias, clinical data, or generic Patient-read
data.

Derived statuses are computed in the application layer:

```text
ACTIVE
  User ACTIVE + valid authSubject
NOT_ISSUED
  eligible PROVISIONED User with no usable activation
ISSUED
  unused, unrevoked, unexpired activation
IN_PROGRESS
  activation has a non-expired claim lease
EXPIRED
  latest activation expired and no usable activation remains
RECONCILIATION_REQUIRED
  known ambiguous local/provider state
```

No persistent UI status enum is introduced.

## 4. Issue, reissue, link, and QR

`PatientActivationService.issuePatientActivation` is transport-independent:

```text
authorize and re-resolve DB state
  → validate Patient/User eligibility
  → recover only a safe stale claim, or fail closed
  → revoke the previous unused activation when reissue is explicit
  → generate an opaque random credential
  → store tokenHash and expiry in a transaction
  → audit issuance/revocation
  → return raw token once
```

The token is generated with a cryptographically secure 256-bit random source and
encoded URL-safely. The default activation lifetime is 24 hours. This is a
**REVERSIBLE MVP IMPLEMENTATION CONSTRAINT**, not a permanent business rule or
configuration system.

Link and QR are two presentations of the same backend credential:

```text
raw token → /activate/patient#<opaque-token> → copy link / QR
```

The token is placed in the URL fragment, not the pathname or query string. QR is
rendered with the existing `qrcode` dependency and is not persisted. A previous
raw link cannot be recovered after the issuance response is lost; explicit
reissue revokes the old credential and returns a new raw token for presentation.

## 5. Public Patient claim flow

The public `/activate/patient` page does not require login. The browser reads the
fragment, removes it from the visible history entry, and requests informational
details from the server. Safe details are limited to display name, Hospital name,
and expiry. Unknown, expired, revoked, used, and reconciliation-required links
share a generic safe invalid state.

The final form submit always revalidates server state. The Patient supplies both
password fields and owns the credential. The existing 12–128 character password
policy is reused. Hospital staff never submit or see the password.

Successful local post-conditions are:

```text
User.status: PROVISIONED → ACTIVE
User.authSubject: null → valid provider subject
PATIENT role: preserved
other roles: preserved
PatientProfile: unchanged
PatientHospitalRelationship: unchanged
PatientActivation.usedAt: set
```

The Patient is redirected to `/login?activated=1`; no Patient dashboard is part
of this phase.

## 6. Crash-safe claim lease and stale recovery

The claim is a bounded lease, not an infinite lock. The lease is defined once in
`activation-token-service.ts`:

```text
PATIENT_ACTIVATION_CLAIM_LEASE_MS = 5 minutes
```

This duration is a **REVERSIBLE MVP IMPLEMENTATION CONSTRAINT** chosen for the
expected Supabase request duration.

An active claim requires:

```text
claimedAt IS NOT NULL
claimExpiresAt > now
reconciliationRequiredAt IS NULL
usedAt IS NULL
revokedAt IS NULL
```

A stale claim has an expired (or legacy missing) lease. It is not automatically
trusted. The service first checks current local authentication state:

- `User.PROVISIONED` + `authSubject IS NULL` + no reconciliation marker: clear
  `claimedAt` and `claimExpiresAt`, record
  `patient_activation.stale_claim_released`, and allow a guarded retry/reissue;
- `User.PROVISIONED` + a valid `authSubject`: set
  `reconciliationRequiredAt`, clear the lease, record
  `patient_activation.reconciliation_required`, and block normal claim/reissue;
- any existing reconciliation marker: remain blocked.

The same logic handles a process crash after the claim transaction commits. A
process crash after local provider mapping but before `User.ACTIVE` is therefore
not silently converted into a new activation or an automatic status repair.

## 7. Provider outcome contract and compensation

Supabase Auth remains behind the existing server-only
`provisionPasswordAuthIdentity` boundary. It uses the established opaque
internal alias (`<User.id>@auth.demi.internal`) required by the current `/login`
architecture; no Patient email or phone ownership is invented.

The shared boundary now classifies outcomes with typed errors:

- `PasswordAuthProvisioningProviderRejectedError`: a known definitive provider
  rejection where remote creation is proven absent; Patient releases the claim
  and remains retryable;
- `PasswordAuthProvisioningIdentityConflictError`: provider alias conflict;
  fail closed as reconciliation-required;
- `PasswordAuthProvisioningReconciliationError`: transport loss, timeout,
  reset, unknown provider failure, 5xx, or malformed mutation success where
  remote creation may have happened; retain the reserved Patient activation and
  mark reconciliation-required.

The shared callers used by Workforce and Platform Admin continue to catch the
reconciliation class and preserve their existing fail-closed compensation
behavior. No generic provider abstraction is introduced.

When provider success returns a valid subject but local finalization fails, the
Patient flow attempts, in order, to detach the known local subject, delete the
known provider identity, and release the claim. It releases the claim only when
the compensation path is definitive. Any ambiguous detach/delete/release result
sets or preserves `reconciliationRequiredAt` and reports no success. It never
overwrites an existing mapping or removes an unknown remote provider identity.

## 8. Concurrency and replay protection

Claim and finalization use serializable PostgreSQL transactions plus guarded
conditional updates. The exact activation row, claim timestamps, User mapping,
PATIENT role, PatientProfile, relationship, and Hospital state are checked again
before finalization. Double submit, two tabs, repeated QR scans, and replay of a
used/revoked token allow at most one claimant to reach provider provisioning.

The raw token is never logged or audited. Passwords, National IDs,
`identityKeyHash`, provider aliases, provider subjects, and provider secrets are
also excluded from audit metadata.

## 9. Audit events

The implementation records the following minimal events where applicable:

- `patient_activation.issued`
- `patient_activation.revoked`
- `patient_activation.completed`
- `patient_activation.stale_claim_released`
- `patient_activation.reconciliation_required`

Audit and authoritative local state changes are kept transactionally consistent
inside local PostgreSQL transactions where possible. Reconciliation marking is
deliberately fail-closed if the marker/audit write cannot be made authoritative.

## 10. Tests and validation

Coverage includes:

- Hospital issuance policy, inactive/unrelated scope, active-user no-op, and
  unexpected mapping states;
- token hashing, expiry, reissue/revocation, replay, raw-token audit exclusion;
- bounded claim lease, active-claim concurrency, stale clean recovery, stale
  mapped-state blocking, and reconciliation-required reissue blocking;
- definitive provider rejection, transport/5xx ambiguity, alias conflict,
  malformed success, safe compensation, and ambiguous compensation;
- successful activation preserving roles, PatientProfile, and Hospital
  relationship;
- exact National ID HMAC lookup, Hospital-scoped HN lookup, duplicate HN safety,
  minimal projection, and derived status projections;
- provisioning and Excel regression coverage proving no activation rows/tokens
  are created;
- Server Action validation, safe public invalid state, password confirmation,
  issue/reissue result serialization, and no nested provisioning forms.

Final repository validation:

```text
npx prisma validate       PASS
npx prisma generate       PASS
npm run lint              PASS
npm run typecheck         PASS
npm test                  PASS (33 files, 171 tests)
npm run test:integration  PASS (6 files, 76 tests)
```

## 11. Explicitly deferred

This phase does not add:

- Patient dashboard, generic Patient roster/read/update/delete framework, or
  Patient profile editing;
- clinical records, screening, HbA1c, care plans, appointments, PAM, or clinical
  assignment;
- OSM Patient assignment or OSM activation issuance;
- OTP, SMS, email verification/delivery, ThaID, LIFF, or another identity
  provider;
- password reset redesign, account recovery, CAPTCHA, or new rate-limit
  infrastructure;
- automatic or generic reconciliation console/workflow, workers, queues, Redis,
  background jobs, or a generic lease/workflow/IAM/provider abstraction.

Manual administrative recovery for `RECONCILIATION_REQUIRED` remains deferred.
The claim lease, 24-hour expiry, direct Hospital `OWNER`/`MEMBER` policy, QR
presentation, and internal provider alias remain replaceable at their service,
policy, transport, and integration boundaries.
