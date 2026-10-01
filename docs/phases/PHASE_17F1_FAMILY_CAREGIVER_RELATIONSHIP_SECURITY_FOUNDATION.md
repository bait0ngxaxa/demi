# Phase 17F.1 — Family / Caregiver Relationship Security Foundation

Status: implementation delivered for the approved security foundation. This
does not close Family overall or authorize Patient-resource access.

Starting HEAD: `460050fae557d6c71a59d36a2643ce336c03c74b`
(`docs(phase-17f0): separate kinship eligibility from account approval`). HEAD
remained unchanged during this implementation.

## Delivered scope

The implementation adds purpose-specific `CaregiverInvitation` and
`CaregiverRelationship` persistence, a Family relationship policy and service,
bounded management queries, authenticated Server Actions, and Thai management
and invitation-preview pages. No generic delegation framework was introduced.

Patient SELF resolves its own current ACTIVE User, Person and PatientProfile on
the server. It locates a recipient only through the existing Thai National ID
validation/canonicalization and `hashIdentityReference` pipeline, then resolves
`Person.identityKeyHash` to exactly one existing ACTIVE User/Person with an
active authentication subject. The recipient needs no PATIENT role or
PatientProfile. Issuance creates no account. National ID is neither persisted
in Family records nor included in audit metadata, URLs, action results or
management projections.

Each invitation uses 32 cryptographically random bytes (256 bits), encoded as a
43-character base64url secret. Only its SHA-256 digest is stored in the unique
`tokenHash` column. The Patient receives the plaintext only in the successful
issuance response needed to share the invite link. The secret is transported in
the URL fragment, removed from browser history after client hydration, and
excluded from referrers. Opening the invitation is read-only. The recipient
must authenticate, match the exact bound User and Person, and explicitly accept
or reject. The login continuation accepts only the exact Family invitation
route plus a valid opaque token.

PostgreSQL supplies `issuedAt` from `clock_timestamp()` at millisecond
precision; `expiresAt` is derived from that same value plus exactly 24 hours.
A database check enforces this interval. Acceptance and pending transitions
check expiry against the database clock at the conditional write boundary.
An expired PENDING invitation is reconciled before same-pair reissue and when
acceptance encounters it; no background job is required.

## Lifecycle and database invariants

Invitation states are `PENDING`, `ACCEPTED`, `REJECTED`, `REVOKED`, and
`EXPIRED`. Relationship states are `ACTIVE`, `REVOKED`, and `WITHDRAWN`.
Acceptance records `family-delegation-v1`, consumes the invitation, creates one
ACTIVE relationship and writes both audit events in one Serializable
transaction. Rejection and Patient pending-invite revocation are distinct
terminal transitions. Patient relationship revocation and caregiver withdrawal
are conditional terminal updates to only the addressed relationship. Rejoining
after any terminal relationship requires a new invitation and new acceptance;
old records are not reactivated.

The migration adds PostgreSQL partial unique indexes for at most one PENDING
invitation and one ACTIVE relationship per Patient/caregiver pair. Prisma 6.19
does not model partial unique indexes, so the indexes are explicit in the SQL
migration and documented there. Issuance, acceptance, revocation and withdrawal
use the repository Serializable transaction helper, conditional state changes,
and retry handling; the database indexes remain the final pair-cardinality
boundary. Patient SELF cannot invite the same User or Person as caregiver.
There is no maximum number of caregivers per Patient or Patients per caregiver.

Account ineligibility denies current caregiver operations without changing the
relationship state. If the same account becomes ACTIVE again while the
relationship remains ACTIVE, it may use that relationship. ACTIVE relationships
have no expiry or renewal lifecycle in this slice.

## Authorization, routes and projections

`/app/family` supports both “ผู้ที่ดูแลคุณ” and “ผู้ที่คุณดูแล” through the
same authoritative relationship row. Patient ownership and caregiver
participation are derived from the authenticated actor and persisted records;
client IDs only locate a row within that server-derived scope. A caregiver does
not need the PATIENT role to open the shared route or manage its own Family
records.

`/app/family/invitations` previews only an invitation matching the authenticated
recipient. Its allowlisted preview fields are Patient `givenName` and
`familyName`, invitation status and expiry, and the acceptance contract version.
The caregiver management list does not include the other participant’s name.
The Patient management list likewise does not include caregiver identity.

Management queries use explicit selects. The Patient invitation projection is
`id`, `status`, `issuedAt`, and `expiresAt`; the Patient relationship projection
is `id`, `status`, `activatedAt`, `revokedAt`, and `withdrawnAt`. The caregiver
management projections use those same lifecycle fields. They do not serialize
whole Person, User, PatientProfile or PatientHospitalRelationship records and
do not load HN, National ID/hash, auth subject, role/membership, Hospital
history, emergency contact or Patient clinical domains.

The Patient SELF capability allowlist remains unchanged and is EMPTY for
caregiver relationships. No caregiver Patient-profile, Hospital-profile,
appointment, care, Screening, Baseline, Program, Goal Plan, Follow-up, Final,
evidence, service-request, medication, clinical-record or emergency-contact
read/write path was added. Family does not reuse `PatientOsmAssignment` or
emergency-contact data. No `Role.CAREGIVER`, Patient impersonation, new-account
onboarding, QR transport, kinship enum or legal-representation verification was
added.

## Audit and verification

The service records `caregiver_invitation.created`, `.accepted`, `.rejected`,
`.revoked`, and `.expired`, plus `caregiver_relationship.activated`, `.revoked`,
and `.withdrawn`. Required business writes and audits share one transaction.
Metadata is limited to opaque resource IDs, lifecycle state, expiry and the
acceptance version; it excludes National ID, identity hash, token/digest,
contact/authentication data and clinical data.

Focused unit/UI coverage verifies policy boundaries, token hashing and entropy,
projection allowlists, generic recipient errors, strict login continuation,
Thai management states, and that rendering the invitation route does not
accept. PostgreSQL integration coverage exercises existing-account identity
resolution, exact recipient binding, no new-account creation, 24-hour TTL,
terminal lifecycle, pair indexes, concurrent issuance/acceptance/revoke races,
expiry reconciliation, role isolation, inactive/reactivated accounts, audit
attribution/privacy and rollback when a transactional audit insert fails.

Verification completed:

- `npx prisma validate` — passed.
- `npm run test:integration` — migration applied; 26 files and 254 tests passed.
- Focused Family/auth/navigation/personal unit and UI tests — 8 files and 40 tests passed.
- `npm run test` — 172 files and 1,211 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- Impeccable detector on changed UI targets — no findings.
- Final `git diff --check` — passed.

## Remaining gates

P17F-L01 and P17F-L02 remain open before any Patient-resource read or scope
change. P17F-L03 and QR transport remain future Phase 17F.3. P17F-L04 re-audit
and UAT closure remain future work. P17F-L05 governs any future renewal or
automatic expiry expansion. P17F-L06 kinship/non-relative eligibility remains
open; this implementation does not infer that non-relatives are approved for
production access. Minors and legal representation are deferred. Phase 17E.2
consent remains parked, medication remains Phase 17G, and broader
production/shared abuse protection remains a deployment hardening gate.
