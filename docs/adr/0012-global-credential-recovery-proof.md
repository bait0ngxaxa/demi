# ADR-0012 — Global credential recovery requires independent owner proof

Status: Accepted security restriction, amended 2026-10-22 by the REC-1 product decision below.
Supersedes: ADR-0008 D3 credential-replacement trust and Phase 17E.1 assisted-recovery ownership assumptions.

## Context

One User credential authorizes all persisted roles and Hospital memberships. An issuer who sees
an assisted bearer token and knows the National ID can complete the same ceremony as the target.
Staff attestation, ADMIN/OWNER authority and issuer sign-out do not independently prove account
ownership. Existing verified current-password change provides user-controlled proof but cannot
serve a user who has forgotten that password. No approved universal recovery proof exists.

## Decision

The original restriction below remains in force for every recovery entry point except the exact
OWNER/ADMIN-mediated reset flow approved by the dated REC-1 amendment at the end of this ADR.
That amendment supersedes only the global disable and terminal-takeover clauses it names.

Distinguish Hospital authority to request recovery, authority to supervise/approve assistance,
actual independent account-owner proof, and permission to replace the global credential. The first
two never imply the latter two. Disable workforce RESET and Patient assisted recovery at all
service entry points, including Patient-only, ADMIN and cross-scope targets. Remove the reachable
replacement execution paths. Preserve normal login, authenticated current-password change and
first-time activation; do not split identities or add messaging/external providers.

Forward-only migrations revoke outstanding unsupported capabilities while retaining hashes,
claims and consumed history. Unfinished claimed recovery quarantines auth-owned application
access even after revocation/expiry, because provider effects cannot be assumed rolled back.
Controlled reconciliation must preserve evidence and may not clear claims solely on ADMIN
attestation. See the [operation runbook](../phases/WORKFORCE_ONBOARDING_V2_REMEDIATION.md).

## Original consequences (before REC-1)

Before the dated amendment, Thai UI explained that recovery was unavailable and directed users to
operational escalation without collecting additional PII or passwords. This is historical context;
REC-1 now defines the only approved recovery route. Hospital authority and demographic knowledge
alone remain insufficient for global credential replacement. Historical decisions/tests remain
historical evidence.


## Addendum — first credential of an unactivated PATIENT identity

The same ownership argument applies to **initial** credentials: a workforce activation token and
the national ID typed by its issuer do not prove ownership of the global credential of a User that
already owns the Patient domain and has not activated it. The workforce activation flow therefore
refuses such Users at issuance and at every activation step (see ADR-0008 amendment
"identity ownership and single-Hospital pending scope"). No recovery or replacement path is added
and no restriction in this ADR is weakened.


Addendum (review `6a68463`): the same rule applies in both directions. Neither a Patient activation token
nor a workforce activation token, nor staff attestation or the national ID, establishes ownership of a
global credential for authority the other domain already holds. Patient activation is now refused for
`PROVISIONED` Users with pending workforce authority. Patient-only activation still has no independent
owner proof and remains an undecided SECURITY_GATED item. No recovery path is added.

## Cross-reference — ADR-0020 self-registration exception (2026-10-22)

[ADR-0020](0020-self-registration-by-national-id.md) records the Product Owner's explicit risk acceptance for a narrowly scoped first credential by national ID. This is an exception to the first-credential rule only for eligible pre-provisioned records through `/register`; it does not establish a general ownership proof, authorize recovery, or alter the recovery restrictions and quarantine rules in this ADR. Partner-agency acknowledgement of the patient enrollment disclosure remains a production gate.

## Amendment — REC-1 OWNER/ADMIN-mediated reset and takeover reclaim

Product decision: OWNER, 2026-10-22 17:26 Asia/Bangkok. This amendment is accepted and supersedes
the original blanket recovery disable only for the paths and policy below. Every other recovery
entry point remains disabled; self-service reset, OTP, email/SMS recovery, LINE recovery and ADMIN
self-reset are not approved.

### Approved ceremony

- Reset is available only through an authenticated, active OWNER of the exact ACTIVE Hospital or
  an authenticated, active platform ADMIN. The issuer must select one recorded verification method:
  `IN_PERSON_ID_CARD`, `VIDEO_CALL_FACE_AND_ID_CARD`, or
  `CALLBACK_PHONE_ON_HOSPITAL_RECORD`. For callback, the UI explicitly forbids using a number the
  requester supplied. No image or National ID value is persisted; the audit stores the method,
  mode, issuer and outcome without PII.
- `IN_PERSON` reuses the assisted ceremony, expires after 15 minutes, and requires handing the
  device to the account owner, who enters their own National ID and sets the password. Issuing it
  signs the issuer's session out first (if sign-out fails the just-issued reset is revoked and an
  error is shown) and the device then navigates once to the reset page; no copyable link or QR is
  shown for `IN_PERSON`. `ONLINE`
  issues one single-use bearer link valid for 24 hours; the OWNER delivers it out of band (including
  LINE chat), and the owner opens it on their own device and enters their own National ID and new
  password. Five incorrect National IDs revoke either capability.
- An active direct OWNER may reset a non-self MEMBER, OSM or patient only when all of the target's
  `HospitalMembership`, `OsmHospitalRelationship` and `PatientHospitalRelationship` rows, including
  ended rows, are scoped to that one Hospital, the target is not an ADMIN or an OWNER anywhere, and
  the target does not itself act as a caregiver (no `CaregiverRelationship` or
  `CaregiverAppointmentGrant` with the target as `caregiverUserId`). A patient who has caregivers
  stays OWNER-eligible. Every other target, including multi-Hospital users, caregivers, any OWNER
  and any ADMIN, requires a platform ADMIN; ADMIN may not reset themself. Self-registered and
  invited active accounts follow the same rules.
- ADMIN searches by exact National ID using the existing HMAC identity lookup; the lookup is audited
  without storing the National ID or hash. A Hospital scope is selected and stored with the reset.
- Workforce targets reuse `WorkforceActivation` with purpose `RESET`; patient-only targets reuse
  `AccountRecovery`. No third capability/token framework is introduced. Each operation binds target,
  Hospital, purpose, mode, verification method and issuer. Issuer, active Hospital, scope, target and
  exact relationship eligibility are re-authorized at completion. Per-User credential operations are
  serialized. Provider I/O occurs outside database locks.

### Credential replacement and reconciliation

Completion creates a new Supabase Auth identity with an operation-specific internal login alias,
switches the canonical `User.authSubject` and alias in the finalize transaction, then deletes the old
identity. Supabase admin `createUser`, `deleteUser`, `getUserById` and `listUsers` require a
server-held service role; neither credential nor service key reaches the browser
([createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser),
[deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser),
[getUserById](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid),
[listUsers](https://supabase.com/docs/reference/javascript/auth-admin-listusers)). DEMI also verifies
the captured session with Auth `getUser` on every exact-session request
([getUser](https://supabase.com/docs/reference/javascript/auth-getuser)). Supabase access JWTs can
remain valid until expiry; old application sessions are refused because their subject no longer maps
to the canonical User, independently of provider-side token expiry
([session semantics](https://supabase.com/docs/guides/auth/sessions)).

The existing claim → provider-started → provider-confirmed → finalize state machine is reused. Only
an ambiguous outcome quarantines; every quarantine and every definite failure has a recovery path:

- A definite `createUser` rejection — an Auth API error with code `weak_password` or
  `validation_failed` ([error codes](https://supabase.com/docs/guides/auth/debugging/error-codes)) —
  proves no identity exists. The claim is rolled back in one transaction (failed-ID count kept), the
  user sees a field error and may retry with the same link until it expires. Transport errors, 5xx,
  rate limits, `email_exists` and unknown errors stay ambiguous.
- If issuer or target authorization is lost between claim and switch, the reset is revoked and the
  claim released (the old identity is still canonical, so the old password keeps working); a created
  replacement identity is deleted.
- The switch re-authorizes, changes `User.authSubject`/alias and finalizes in one transaction, which
  also records the previous identity in `ProviderIdentityCleanup`. Deleting it afterwards is off the
  user's critical path: on failure the user can still log in with the new password (no User maps to
  the old subject, so it cannot reach the application), the event
  `account.password_reset.previous_identity_cleanup_pending` is audited and the idempotent delete is
  retried on the next reset issue or ADMIN reconcile. A subject that a User maps to is never deleted.
- An ambiguous create or database step leaves the reset claimed in `RECONCILIATION_REQUIRED`
  quarantine. A platform ADMIN reconciles it in `/app/admin/recovery`: the provider is checked for
  the reset's deterministic replacement alias (`listUsers`, all pages) and the previous subject
  (`getUserById`). If the canonical User already maps to the replacement, the reset is finalized and
  the previous identity deleted; if it still maps to an existing previous identity, any orphan
  replacement is deleted and the reset revoked, so the old password works and a new reset can be
  issued. An unconfirmed probe or any other state keeps the quarantine. Reconciliation is audited
  (`account.password_reset.reconciled`) and never clears quarantine on attestation alone.

Two concurrent completions can create at most one credential. Events written while serving the
anonymous link holder (identity check, rollback, revoke, completion, cleanup-pending, LINE notice,
takeover-lock resolution) record `actorUserId` null and the issuer as `metadata.issuerUserId`.

On success, the User is ACTIVE; an UM-1 lock is marked `RESOLVED`, its exact suspended staff/OSM
relationship snapshot is restored at the lock Hospital, and the lock/audit history is retained.
LINE bindings created after the lock remain unlinked and require the user to link LINE again. An
active LINE binding receives `รหัสผ่านบัญชี DEMI ของคุณถูกเปลี่ยนเมื่อ <เวลา> หากไม่ใช่คุณ ติดต่อโรงพยาบาล`.

`/recover` without a token instructs the user to contact their Hospital for an in-person or video
verification. `/register` tells an already-active requester to contact the Hospital for a verified
reset. The OWNER guide and remediation runbook define the procedure and reconciliation boundary.

### FIX-1 credential-assurance amendment (2026-10-23)

`User.identityAssurance` records `HOSPITAL_PROOFED`, `SELF_REGISTERED`, or `CAREGIVER_INVITATION`. A caregiver-claimed User later reused by Patient/workforce provisioning is suspended and receives a `UserTakeoverLock` in the same transaction as the new role and relationship; provider revocation remains outside database locks and uses the existing `PENDING` / `CONFIRMED` / `RECONCILIATION_REQUIRED` states. The REC-1 verified reset replaces the credential, restores only the recorded suspended workforce relationships, marks the lock `RESOLVED`, and sets assurance to `HOSPITAL_PROOFED`. Caregiver relationships and grants are neither removed nor suspended. Because an acting caregiver is OWNER-ineligible under the existing rule above, only a platform ADMIN can release this account.

### FIX-1b held child OWNER invitation amendment (2026-10-23)

This is the only additional REC-1 eligibility exception. A platform ADMIN may search, issue and complete a reset for an exact `HospitalMembership` OWNER relationship recorded in `UserTakeoverLock.heldOwnerMembershipIds`, while the target remains `SUSPENDED` with `identityAssurance = CAREGIVER_INVITATION` and that lock is unresolved. The recorded relationship must belong to the target at the Child named by the reset (FIX-1c: not necessarily the Hospital that first locked the identity), be the OWNER invitation created for that Child, and the Hospital must be a CHILD in `PENDING_VERIFICATION` or `ACTIVE`. Its invitation membership may now be `PROVISIONED` or `ENDED`; an ended/replaced invitation remains a valid reset locator so that cancelling an invitation cannot strand the global account. Every other target at a non-ACTIVE Hospital remains ineligible. A Parent or any other OWNER receives `403`; this exception does not expand OWNER authority.

The same target, lock, hospital and issuer conditions are re-authorized at issue, identity claim and credential switch. The issuer records one existing verification method and performs the usual REC-1 ceremony. Provider I/O remains outside database locks. Completion replaces the global credential, sets the account `ACTIVE` and `identityAssurance = HOSPITAL_PROOFED`, restores the exact previously suspended MEMBER/OSM rows, and resolves the lock. For each recorded held OWNER membership, completion changes `PROVISIONED` to `INVITED` only when it is still `PROVISIONED` and the existing Child invitation context remains valid (Child kind/status, active service area, current inviting Parent OWNER authority, and no conflicting owner/invitation). Otherwise that row stays unchanged and its ID/reason is included in the resolution audit. An `ENDED` row is never revived. Reset does not accept the invitation or activate the Child; the verified account holder must still use the existing in-app `acceptChildOwnerInvitation` flow.

To preserve the only approved release route, a Parent cannot retire a pending Child while its unresolved lock records a held OWNER membership. The Parent may still end or replace the invitation; the platform ADMIN reset releases the account without reviving an ended membership. This narrow safeguard prevents a retired Hospital from making the target permanently ineligible under the REC-1 hospital-status rule.

### FIX-1c multi-hospital takeover lock amendment (2026-10-23)

A `UserTakeoverLock` belongs to the User, not to one Hospital. `hospitalId` keeps the Hospital that first locked the identity (used for the lock audit and the LINE-binding cut-off); it is not a scope check. While a caregiver-claimed User's lock is unresolved (`PENDING`, `RECONCILIATION_REQUIRED` or `CONFIRMED`), any later Hospital operation that adds authority to that User extends the same lock in its own transaction: workforce/OSM rows it creates or finds `PROVISIONED`/`ACTIVE` at its Hospital are set `SUSPENDED` and their IDs appended to `suspendedMembershipIds` / `suspendedOsmRelationshipIds`; a held Child OWNER invitation ID is appended to `heldOwnerMembershipIds`. A `user.takeover_lock_extended` audit records the Hospital and counts. Provider revocation runs again only while the lock is not yet `CONFIRMED`.

Every rule keyed on the lock is evaluated per recorded ID and that row's own Hospital: the held-OWNER ADMIN exception and search above, the Parent's held-invitation view and retire guard, invitee listing/acceptance, and completion. Completion restores each recorded `SUSPENDED` row at whatever Hospital it belongs to, applies the FIX-1b held-OWNER rules against each row's own Child, and keeps the restored / not-restored audit. Because the restored scope now spans Hospitals, the existing single-Hospital OWNER eligibility rule makes such a target platform-ADMIN-only.
