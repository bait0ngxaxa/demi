# ADR-0012 — Global credential recovery requires independent owner proof

Status: Accepted security restriction, amended 2026-10-25 by REC-2A and REC-2B; originally amended 2026-10-22 by REC-1.
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
  device to the account owner, who confirms their Thai National ID, or the registered login
  identifier for a Platform ADMIN, and sets the password. Issuing it
  signs the issuer's session out first (if sign-out fails the just-issued reset is revoked and an
  error is shown) and the device then navigates once to the reset page; no copyable link or QR is
  shown for `IN_PERSON`. `ONLINE`
  issues one single-use bearer link valid for 24 hours; the OWNER delivers it out of band (including
  LINE chat), and the owner opens it on their own device and confirms their Thai National ID, or
  the registered login identifier for a Platform ADMIN, before setting a new password. Five
  incorrect identity confirmations revoke either capability.
- An active direct OWNER may reset a non-self MEMBER, OSM or patient only when all of the target's
  `HospitalMembership`, `OsmHospitalRelationship` and `PatientHospitalRelationship` rows, including
  ended rows, are scoped to that one Hospital, the target is not an ADMIN or an OWNER anywhere, and
  the target does not itself act as a caregiver (no `CaregiverRelationship` or
  `CaregiverAppointmentGrant` with the target as `caregiverUserId`). A patient who has caregivers
  stays OWNER-eligible. Every other target, including multi-Hospital users, caregivers, any OWNER
  and any ADMIN, requires a platform ADMIN; ADMIN may not reset themself. Self-registered and
  invited active accounts follow the same rules.
- ADMIN searches ordinary targets by exact National ID and Platform ADMIN targets by their exact
  registered login identifier, using the existing HMAC identity lookup; the lookup is audited
  without storing the identifier or hash. A Hospital scope is selected only for Hospital-scoped
  targets. A Platform ADMIN target has no Hospital or relationship context and appears once,
  regardless of Hospital lifecycle or count. A peer ADMIN remains the only web issuer for that
  target; self-reset is denied.
- Workforce targets reuse `WorkforceActivation` with purpose `RESET`; patient-only targets reuse
  `AccountRecovery`. No third capability/token framework is introduced. Each operation binds target,
  its discriminated Hospital or Platform ADMIN context, purpose, mode, verification method and
  issuer. Issuer, Hospital when applicable, scope, target and exact relationship eligibility are
  re-authorized at claim and credential switch. Per-User credential operations are
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

## Amendment — REC-2A mediated reset, break-glass and throttling (2026-10-25)

Product decision: a co-OWNER may reset another OWNER in the same ACTIVE Hospital; an OWNER may reset a caregiver-only account when every patient that account serves is scoped only to that Hospital; a platform ADMIN may reset another ADMIN. This amendment supersedes only REC-1's contrary target exclusions and former ADMIN-peer restriction. Every other REC-1 ceremony, token, state-machine, audit, takeover-lock and reconciliation rule remains in force.

### Eligibility and re-authorization

- A direct ACTIVE Hospital OWNER may reset another non-self OWNER of the same ACTIVE Hospital only when the target is not an ADMIN and **every** target `HospitalMembership`, `OsmHospitalRelationship` and `PatientHospitalRelationship` row, including ended rows, belongs to that Hospital. The issuer must remain an active direct OWNER. The selected target membership and full target scope are re-checked at issue, identity claim and credential switch.
- A direct ACTIVE Hospital OWNER may reset a non-self target whose only role is `CAREGIVER` when every `CaregiverRelationship`, `CaregiverAppointmentGrant` and `CaregiverResourceGrant` row where the target is `caregiverUserId`, including ended rows, points to a patient whose complete `PatientHospitalRelationship` history, including ended rows, belongs to that ACTIVE Hospital. Caregiver-only accounts are found only through an exact-ID lookup scoped to that Hospital. Mixed-role accounts, a patient served at another Hospital, an unresolved takeover lock, or an unfinished/reconciliation-required credential operation stays platform-ADMIN-only. Existing FIX-1 and FIX-1b/1c behavior is unchanged.
- An active platform ADMIN may reset another active ADMIN, never themself, through the REC-1 identity-confirmation ceremony. ADMIN may still reset other target kinds under REC-1 and the FIX-1b/1c exception.
- All issuer/target decisions are re-authorized at issue, identity claim and credential switch. Authority loss revokes the reset and deletes an orphan replacement as in REC-1; an ambiguous provider/database result remains quarantined for audited reconciliation.

### Last-ADMIN break-glass

`npm run admin:recover` is a server-only operator CLI using the server-held Supabase service role from environment configuration. The operator selects an active ADMIN by the same login identifier accepted at `/login`; the password and confirmation are hidden terminal input. It creates an already-claimed `WorkforceActivation` RESET record and then uses the same provider replacement, canonical switch, cleanup and reconciliation code as REC-1. It prints no bearer token, password or key. By default it refuses when another ACTIVE ADMIN exists; the explicit `--no-active-peer --reason "<text>"` override is audited and requires an operator note. The audit action `account.password_reset.break_glass` stores the note, reset reference, override state and outcome, never a secret. Only authorized server operators with access to the production environment may run it; see the [break-glass runbook](../operations/ADMIN_RECOVERY.md) for authorization and retained evidence.

### Throttling, entry and account settings

Password login, the National-ID recovery lookup and the National-ID proof step use DEMI-side failure buckets in addition to Supabase limits: five failures in 15 minutes starts a 15-minute block, independently by HMACed identity and client IP. Buckets and block audits contain no National ID, IP, identity hash or credential. Login and recovery messages remain generic across existing and unknown accounts. The VPS trusts only nginx-overwritten `X-Real-IP`, after Cloudflare real-IP validation; the app does not trust `X-Forwarded-For`.

`/login` links to `/recover`, which offers Hospital identity verification and exposes the future LINE recovery entry only when `DEMI_RECOVERY_LINE_ENABLED=true`. Leave the flag false until REC-2B ships; REC-2A adds no self-service recovery. Tokenized REC-1 links continue to use the same `/recover` completion flow. The OWNER directory shows the latest mediated-reset date and path without National ID or issuer details.

Authenticated current-password changes are available to every role from Settings. An explicitly invalid current password returns a Thai field error and counts against the same identity/IP throttle. After `auth.updateUser`, DEMI calls `auth.signOut({ scope: "others" })`; Supabase documents that password update does not itself terminate other sessions, while this scope retains the current session and ends the others ([sign-out guide](https://supabase.com/docs/guides/auth/signout), [JS reference](https://supabase.com/docs/reference/javascript/auth-signout)). An active LINE binding receives the existing password-changed notice.

## Amendment — REC-2B forgotten-password recovery through LINE (2026-10-25)

This amendment supersedes REC-1 and REC-2A's former exclusion of LINE recovery only for the flow below. Forgotten-password recovery is distinct from authenticated current-password change. It never grants LINE sign-in, a DEMI role, membership, permission, or data access. Platform ADMIN remains excluded from self-service recovery; all other roles may use it only when eligible.

### Request, delivery and proof

- The web `/recover` chooser and the LINE account LIFF page accept a National ID. The server performs the existing HMAC identity lookup and returns the same Thai response for existing and nonexistent accounts, missing/ineligible LINE bindings, disabled configuration, throttling and delivery failure. A successful response does not confirm that an account or binding exists.
- DEMI applies the REC-2A identity/IP failure buckets to the National-ID request step and permits at most three capability issuances per User per hour. A new capability is a single-use row valid for 15 minutes, bound to the target User, exact active LINE binding ID and HMAC LINE-subject fingerprint; it is usable only after LINE accepts the push. A new request revokes an older unclaimed capability. Failed or ambiguous delivery is revoked and audited without PII. Legacy capabilities retain their token hashes until their original expiry.
- New Push messages contain a LIFF recovery URL with a random capability-row UUID locator, not a bearer credential. That locator has no authority without a fresh raw LIFF ID token whose server-verified subject fingerprint matches the capability's exact active binding; client-supplied profile fields or LINE user IDs are never authority. Legacy fragment-token links already issued before this change remain accepted until their original 15-minute expiry. A forwarded link opened from another LINE account, an expired/wrong-audience token, and an ineligible account are refused without revealing account existence. The recovery page waits for `liff.init()` to restore LIFF URL state, then removes only the application locator or legacy fragment from browser history while preserving LINE-owned query parameters.
- At issuance, link open/claim and credential switch, the User must remain `ACTIVE`, non-ADMIN, without an unresolved `UserTakeoverLock` or an unfinished/reconciliation-required credential reset, and with exactly one active LINE binding still attached to the same User. There is no minimum binding age. A lost binding, authority change, takeover lock or ineligible state revokes the capability and leaves the old credential canonical.
- LINE binding creation requires the signed-in User to re-enter the current DEMI password. The server verifies this step-up and throttles failures using the REC-2A identity/IP buckets before creating the binding; existing intent and CSRF checks remain.

### Credential replacement, audit and rollout

Completion reuses REC-1's existing provider replacement, per-User serialization, canonical subject switch, previous-identity cleanup, quarantine and reconciliation state machine without a second implementation. Authority loss before switch revokes the reset and removes an orphan replacement; ambiguous provider/database outcomes remain quarantined for audited reconciliation. Completion records `account.password_reset.self_service` with the target as actor and the binding ID, without National ID, raw LINE subject or token. The existing `account.password_reset.completed` audit also supplies the reset date/path to the OWNER user directory. DEMI sends the existing LINE password-changed notice when the binding remains reachable and sets a one-time in-app notice for the target's next sign-in.

An authenticated password change reserves the same per-User credential-operation lock before calling Supabase. Recovery issue, claim and final switch are fenced while this operation is unresolved. Once Supabase confirms the change, one serializable transaction revokes only unclaimed capabilities in workforce, patient and LINE recovery storage and clears the fence. A definite provider rejection clears the fence without revoking links; an ambiguous provider or database outcome leaves a durable User fence for reconciliation. Because neither DEMI nor Supabase can prove which password is valid without the password, the operator-only `account:password-change:reconcile` command never infers an unchanged credential. Under the same lock, in one serializable transaction, it revokes every earlier unclaimed capability and releases the fence for one exact User and operation ID. Release also requires evidence that the original request has ended, not age alone. The adapter enforces a 60-second provider deadline fixed before the fence. The password-change process holds a per-User PostgreSQL lease from reservation to resolution, and reconciliation probes it without blocking and refuses while it is held. The command is idempotent per operation, retains the fence for operations younger than 15 minutes, while the lease is held, or while a claimed/reconciliation-required reset exists, and audits each decision ([runbook](../operations/ADMIN_RECOVERY.md)). Claimed or reconciliation-required reset operations block a concurrent authenticated password change and are never cleared by it. The fence is separate from refresh-session revocation: Supabase access JWTs may remain valid until expiry, so application authorization continues to require the current canonical User identity.

New LIFF recovery locators are not authentication tokens and are not sufficient to identify an account. Nginx access logs keep request path, status and timing while omitting query strings and referrers; see the [VPS runbook](../operations/DEPLOY_VPS.md). Already-issued legacy fragment tokens can be present in LINE's LIFF redirect state until they expire, so they still require matching fresh LINE proof and should not be copied into support records.

`DEMI_RECOVERY_LINE_ENABLED` is a fail-closed rollout gate: enabled in the demo environment and false in production until partner-agency notice approval is recorded at RELEASE_GATE G-06. When false, the chooser hides the LINE path; REC-1 tokenized links and Hospital-mediated recovery continue to work. Users without a LINE binding are directed to Hospital-mediated recovery. The exact message and other LINE identity rules remain subject to [ADR-0009](0009-demi-line-oa-liff-identity-and-messaging.md).

### Production-code-first clarification (2026-10-25)

The preceding rollout-gate paragraph records the former deployment behavior and is superseded by this clarification. The REC-2B flow is governed by its permanent identity proof, active LINE binding, current ownership checks, throttling, anti-enumeration, single-use expiry, credential-operation fence, audit, and reconciliation rules; it does not consult `DEMI_RECOVERY_LINE_ENABLED` or RELEASE_GATE status. Missing LINE integration configuration makes that integration unavailable safely and does not disable other recovery paths. Operator and governance records do not act as runtime permission tokens.

## Clarification — Platform ADMIN custom login identifiers (2026-10-26)

Authenticated Platform ADMIN search and the completion confirmation accept either the exact valid Thai National ID or the bounded login identifier accepted by `passwordLoginIdentifierSchema` for a bootstrapped ADMIN. Both resolve through the existing canonical identity index and its HMAC reference. This identifier is only an account locator: it does not establish identity or account ownership. A different active ADMIN must still perform and record one of the approved verification methods, deliver the single-use capability through the trusted handoff, and remain authorized at issuance, claim, and credential switch. The ADMIN receiving the capability confirms the exact registered login identifier only to ensure the capability targets the intended account. Failed confirmations remain throttled. Ordinary Hospital, Staff, OSM, Patient, and Caregiver recovery continues to require a valid Thai National ID.

## Clarification — Platform ADMIN reset context (2026-10-26)

A new peer-assisted Platform ADMIN reset records the exact target User with both `hospitalId` and `relationshipId` set to null. ADMIN search returns one canonical platform target independently of Hospital count or status. Issue, identity claim and credential switch still authorize an active ADMIN issuer, reject self-reset, verify an active ADMIN target, and preserve the recorded independent operator verification and single-use handoff. Hospital-scoped workforce, patient and caregiver resets retain their required Hospital and relationship checks. A forward-only PostgreSQL constraint distinguishes these contexts and keeps `BREAK_GLASS_CLI` exclusive to the null-Hospital Platform ADMIN server operation. Previously issued Hospital-scoped ADMIN resets keep their original active-Hospital check. Legacy null-context RESET rows without a REC-1 verification method remain stored for compatibility but are not recognized as mediated capabilities.
