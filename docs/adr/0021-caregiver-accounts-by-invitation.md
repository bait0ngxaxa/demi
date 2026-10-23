# ADR-0021: Caregiver accounts by patient invitation

- Status: Accepted — Product Owner decision AF-D1, 2026-10-23
- Related: [ADR-0002](0002-roles-capabilities-and-scope.md), [ADR-0012](0012-global-credential-recovery-proof.md), [ADR-0019](0019-owner-administration-and-import-only-roster.md), [ADR-0020](0020-self-registration-by-national-id.md)
- Amended: 2026-10-23 (FIX-1: caregiver-claim assurance, provisioning quarantine, and invitation non-enumeration)

## Context

The Family relationship flow previously required the invited relative to already have an ACTIVE DEMI account. The whiteboard includes a general person who may be a patient or a relative, and the business flow assigns the family member their own role. Hospital staff must not provision or activate a relative just to let a patient share a family invitation.

ADR-0020 is a separate public registration path for people already provisioned by a Hospital. Its national-ID lookup intentionally does not accept unprovisioned identities. Opening that lookup to relatives would disclose caregiver invitations and would create an account path unrelated to a patient-controlled handoff.

## Decision

### Invitation and account boundary

Add the CAREGIVER role. A person who has no DEMI identity can create a CAREGIVER-only account only by accepting a pending, unexpired invitation issued by a Patient. The Patient shares the existing invitation URL or QR. A person who already has an ACTIVE account continues through the existing authenticated invitation preview, accept, and reject flow.

The Patient supplies the intended caregiver's Thai national ID when creating the invitation. If it resolves to an eligible ACTIVE User with an auth subject, the invitation remains bound to the existing User/Person pair. For every other recipient state (no Person, Person without a User, PROVISIONED/INVITED User, or another ineligible account), the invitation stores only the canonical identity-key hash and no recipient User or Person. The only identity-specific refusal is the Patient's own ID. Invitation creation is limited to 10 attempts per day per Patient User and 10 per day per recipient-ID hash; only keyed hashes are persisted. A pending hash-bound invitation cannot be claimed publicly if a Person already exists. After hospital activation, the matching authenticated recipient can accept it through the existing hash-matching path. This creates no second credential path for a Hospital-provisioned identity and does not reveal whether the recipient is already known to DEMI.

The unauthenticated invitation page offers account creation only for a valid bearer token for a hash-bound pending invitation. The person enters a checksum-valid national ID, given and family names, and a password that meets the existing user-owned password policy. The names are self-asserted and are labeled as such to the Patient. The server hashes the normalized ID with the same namespace and secret as Person identity, compares fixed-length hashes in constant time, and checks the invitation again inside the final serializable database transaction.

After the existing Supabase password-credential creation path runs outside database locks, one serializable transaction creates the Person (if still absent), ACTIVE User with `identityAssurance = CAREGIVER_INVITATION`, CAREGIVER role, self-asserted name marker, invitation User/Person binding, ACCEPTED state, ACTIVE CaregiverRelationship, and lifecycle audit events. A confirmed local rollback triggers provider-account compensation. If the transaction outcome cannot be read, the service leaves the provider identity for reconciliation rather than risk deleting a credential for a committed User. The transaction rechecks the token hash, PENDING state, expiry by the database clock, recipient hash and Person absence. A race cannot create a second User or relationship.

If a later Patient or workforce provisioning operation resolves this User, it reuses the canonical Person/User, adds the requested role and Hospital relationship in the same transaction, then suspends the global User and creates/updates the existing `UserTakeoverLock` before commit. Caregiver relationships and grants remain persisted. Provider session revocation runs after commit through the REC-1 takeover reconciliation states; application access is blocked immediately by the local suspension even if provider revocation is ambiguous. A verified REC-1 OWNER/ADMIN-mediated reset is the only release path and changes assurance to `HOSPITAL_PROOFED`. Because these accounts act as caregivers, ADR-0012's existing eligibility sends the reset to a platform ADMIN; OWNER eligibility is not widened. Patient provisioning still replaces self-asserted names with authoritative roster names.

The database permits exactly one of these pending invitation targets: a complete existing User/Person pair, or a recipient identity hash with no pair. The hash-only target is valid only while PENDING. Acceptance clears the hash and binds the exact User/Person pair before the relationship is created. A revoked or expired unclaimed invitation clears its hash. Existing composite User/Person foreign keys and the corrective invitation-source-pair unique key/foreign key remain in force; nullable columns use PostgreSQL's MATCH SIMPLE behavior only for the all-null unclaimed pair, with a CHECK rejecting partial pairs. Accepted relationships still reference the exact persisted source pair.

### Non-disclosure and authorization

The public /register lookup and completion are unchanged. An unregistered invitee remains NOT_FOUND there, and a CAREGIVER-only account also returns NOT_FOUND. Neither route searches invitation hashes or reveals caregiver-only accounts. A CAREGIVER role does not imply PATIENT, workforce, or Platform ADMIN authority. Existing Patient-self, clinical, workforce, Hospital-administration, and Platform-administration policies continue requiring their own persisted role and scope. A caregiver relationship alone grants no patient-health access; any resource access requires a separate approved, exact grant and acceptance.

Wrong ID, expired, revoked, used, malformed, and nonmatching invitations share one safe account-claim error. Invitation creation quota errors also use one generic response regardless of recipient state or which quota was reached. The service writes lifecycle or rejected-attempt audits without national ID, password, token, or identity hash. Persisted rate limits use HMAC hashes for client IP, invitation token, patient User ID, and recipient identity hash. The invitation page and account-claim response are no-store, noindex, and no-referrer.

### Account settings and linked services

A CAREGIVER-only account lands on the Family page. Its available navigation is Family and settings; it has no Patient health menus and no work or administration menus. Family relationship lists, invitations, and separately authorized appointment grants remain available under their existing service checks.

LINE account binding remains limited to the roles admitted by its current LINE eligibility policy. This ADR does not add CAREGIVER eligibility or weaken LINE identity-binding rules.

## Threat model and accepted boundary

- **Pre-hijacking (FIX-1):** an invitation plus the intended national ID lets a claimant establish a first credential, but does not independently prove the claimant owns that identity. `identityAssurance` records this as `CAREGIVER_INVITATION`. If a Hospital later provisions the same identity, the User is suspended and a takeover lock is committed atomically with the added Patient/workforce authority. Provider session revocation then uses the existing REC-1 reconciliation path. The claimant's original credential cannot sign in or read newly provisioned Patient data while suspended. Only a verified mediated reset can replace it and release the account; caregiver targets require platform ADMIN under REC-1. Existing caregiver relationships and grants remain recorded and become usable again after release.
- **Stolen invitation token:** the token is a high-entropy bearer secret with a 24-hour database-clock expiry and one-use lifecycle. A thief still needs the invited national ID to claim an unregistered identity. Anyone holding both can claim first; the Patient must hand off the link or QR deliberately and revoke it if exposed. The later provisioning lock contains this accepted first-credential proof limitation.
- **ID mismatch:** a valid token paired with another person's ID cannot create a Person, User, credential, or relationship. The comparison is constant-time and its failure is indistinguishable from an unavailable invitation to the client. The failed attempt is audited without the submitted ID.
- **Enumeration:** the general /register path never looks up invitations or exposes CAREGIVER-only accounts. The invitation preview reveals the Patient display name and the next step only to a holder of the invitation token. IP/token claim limits and per-Patient/per-recipient creation limits constrain repeated attempts. For every recipient other than the Patient themself, creation returns the same success shape and stores either the eligible ACTIVE User/Person pair or a hash-only target; it does not distinguish an unregistered ID from a pre-provisioned identity. Public claim still refuses if a Person exists, and an activated matching recipient uses authenticated acceptance.
- **Concurrent claims:** the final serializable transaction and unique identity/source constraints choose at most one persisted account and relationship; provider credentials created by losing requests are compensated.
- **Self-asserted names:** they are not identity proof. The Family view labels them as supplied by the caregiver. Patient roster provisioning replaces them with the Hospital's roster names.

This proof is deliberately narrower than ADR-0020: a general national-ID lookup cannot claim an account or discover a pending caregiver invitation. Creation requires both a patient-issued, short-lived secret and a matching checksum-valid national ID. The invitation is still a bearer credential and does not prove kinship or legal representation.

## Recovery limitation

Caregiver-only accounts do not have self-service password recovery. Before Hospital provisioning they do not enter the Hospital's mediated reset directory. After a Patient/workforce provisioning operation quarantines the account, recovery is available only through the verified REC-1 ceremony. The caregiver relationship makes the target OWNER-ineligible, so a platform ADMIN must conduct it. The original invitation and national ID alone are not general recovery proof.

## Consequences

- Hospital staff take no action to create or activate a relative account.
- The public registration flow remains limited to Hospital-provisioned identities and does not disclose caregiver invitations or caregiver-only accounts.
- The role grants Family account capabilities only. A later Hospital provisioning operation reuses the same Person/User and adds the separately authorized role.
- CAREGIVER-only LINE linking and password recovery remain unavailable under current policy.
- No kinship, household, or legal-representation assertion is made.
