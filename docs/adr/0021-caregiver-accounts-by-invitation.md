# ADR-0021: Caregiver accounts by patient invitation

- Status: Accepted — Product Owner decision AF-D1, 2026-10-23
- Related: [ADR-0002](0002-roles-capabilities-and-scope.md), [ADR-0012](0012-global-credential-recovery-proof.md), [ADR-0019](0019-owner-administration-and-import-only-roster.md), [ADR-0020](0020-self-registration-by-national-id.md)

## Context

The Family relationship flow previously required the invited relative to already have an ACTIVE DEMI account. The whiteboard includes a general person who may be a patient or a relative, and the business flow assigns the family member their own role. Hospital staff must not provision or activate a relative just to let a patient share a family invitation.

ADR-0020 is a separate public registration path for people already provisioned by a Hospital. Its national-ID lookup intentionally does not accept unprovisioned identities. Opening that lookup to relatives would disclose caregiver invitations and would create an account path unrelated to a patient-controlled handoff.

## Decision

### Invitation and account boundary

Add the CAREGIVER role. A person who has no DEMI identity can create a CAREGIVER-only account only by accepting a pending, unexpired invitation issued by a Patient. The Patient shares the existing invitation URL or QR. A person who already has an ACTIVE account continues through the existing authenticated invitation preview, accept, and reject flow.

The Patient supplies the intended caregiver's Thai national ID when creating the invitation. If it resolves to an ACTIVE User with an auth subject, the invitation remains bound to the existing User/Person pair. If neither Person nor User exists, the invitation stores only the canonical identity-key hash and no recipient User or Person. If a Person exists with a PROVISIONED or INVITED User, or any other existing identity that is not an eligible ACTIVE recipient, creation fails with the same generic conflict response. This does not create a second credential path for a Hospital-provisioned identity.

The unauthenticated invitation page offers account creation only for a valid bearer token for a hash-bound pending invitation. The person enters a checksum-valid national ID, given and family names, and a password that meets the existing user-owned password policy. The names are self-asserted and are labeled as such to the Patient. The server hashes the normalized ID with the same namespace and secret as Person identity, compares fixed-length hashes in constant time, and checks the invitation again inside the final serializable database transaction.

After the existing Supabase password-credential creation path runs outside database locks, one serializable transaction creates the Person (if still absent), ACTIVE User, CAREGIVER role, self-asserted name marker, invitation User/Person binding, ACCEPTED state, ACTIVE CaregiverRelationship, and lifecycle audit events. A confirmed local rollback triggers provider-account compensation. If the transaction outcome cannot be read, the service leaves the provider identity for reconciliation rather than risk deleting a credential for a committed User. The transaction rechecks the token hash, PENDING state, expiry by the database clock, recipient hash and Person absence. A race cannot create a second User or relationship. When a Hospital later provisions the same identity as a Patient or workforce member, existing provisioning reconciles onto that Person/User and adds its role. Patient provisioning replaces self-asserted names with its authoritative roster names.

The database permits exactly one of these pending invitation targets: a complete existing User/Person pair, or a recipient identity hash with no pair. The hash-only target is valid only while PENDING. Acceptance clears the hash and binds the exact User/Person pair before the relationship is created. A revoked or expired unclaimed invitation clears its hash. Existing composite User/Person foreign keys and the corrective invitation-source-pair unique key/foreign key remain in force; nullable columns use PostgreSQL's MATCH SIMPLE behavior only for the all-null unclaimed pair, with a CHECK rejecting partial pairs. Accepted relationships still reference the exact persisted source pair.

### Non-disclosure and authorization

The public /register lookup and completion are unchanged. An unregistered invitee remains NOT_FOUND there, and a CAREGIVER-only account also returns NOT_FOUND. Neither route searches invitation hashes or reveals caregiver-only accounts. A CAREGIVER role does not imply PATIENT, workforce, or Platform ADMIN authority. Existing Patient-self, clinical, workforce, Hospital-administration, and Platform-administration policies continue requiring their own persisted role and scope. A caregiver relationship alone grants no patient-health access; any resource access requires a separate approved, exact grant and acceptance.

Wrong ID, expired, revoked, used, malformed, and nonmatching invitations share one safe account-claim error. The service writes lifecycle or rejected-attempt audits without national ID, password, token, or identity hash. Persisted rate limits use HMAC hashes for client IP and invitation token. The invitation page and account-claim response are no-store, noindex, and no-referrer.

### Account settings and linked services

A CAREGIVER-only account lands on the Family page. Its available navigation is Family and settings; it has no Patient health menus and no work or administration menus. Family relationship lists, invitations, and separately authorized appointment grants remain available under their existing service checks.

LINE account binding remains limited to the roles admitted by its current LINE eligibility policy. This ADR does not add CAREGIVER eligibility or weaken LINE identity-binding rules.

## Threat model and accepted boundary

- **Stolen invitation token:** the token is a high-entropy bearer secret with a 24-hour database-clock expiry and one-use lifecycle. A thief still needs the invited national ID to claim an unregistered identity. Anyone holding both can claim first; the Patient must hand off the link or QR deliberately and revoke it if exposed.
- **ID mismatch:** a valid token paired with another person's ID cannot create a Person, User, credential, or relationship. The comparison is constant-time and its failure is indistinguishable from an unavailable invitation to the client. The failed attempt is audited without the submitted ID.
- **Enumeration:** the general /register path never looks up invitations or exposes CAREGIVER-only accounts. The invitation preview reveals the Patient display name and the next step only to a holder of the invitation token. IP and token-derived persisted rate limits constrain repeated attempts. Patient invitation creation returns the same response shape for existing and unregistered recipients.
- **Concurrent claims:** the final serializable transaction and unique identity/source constraints choose at most one persisted account and relationship; provider credentials created by losing requests are compensated.
- **Self-asserted names:** they are not identity proof. The Family view labels them as supplied by the caregiver. Patient roster provisioning replaces them with the Hospital's roster names.

This proof is deliberately narrower than ADR-0020: a general national-ID lookup cannot claim an account or discover a pending caregiver invitation. Creation requires both a patient-issued, short-lived secret and a matching checksum-valid national ID. The invitation is still a bearer credential and does not prove kinship or legal representation.

## Recovery limitation

Caregiver-only accounts do not have an approved self-service password-recovery path. The existing mediated recovery rules do not establish an independent owner-proofing path for this account type. Recovery remains unavailable until a separate approved identity-proofing decision exists; staff must not treat the original invitation or national ID alone as general recovery proof.

## Consequences

- Hospital staff take no action to create or activate a relative account.
- The public registration flow remains limited to Hospital-provisioned identities and does not disclose caregiver invitations or caregiver-only accounts.
- The role grants Family account capabilities only. A later Hospital provisioning operation reuses the same Person/User and adds the separately authorized role.
- CAREGIVER-only LINE linking and password recovery remain unavailable under current policy.
- No kinship, household, or legal-representation assertion is made.
