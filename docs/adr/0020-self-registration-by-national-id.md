# ADR-0020: Self-registration by national ID

- Status: Accepted — Product Owner decision, 2026-10-22
- Supersedes: The first-credential ownership restriction in ADR-0008 and ADR-0012 only for the bounded self-registration flow below.
- Related: [ADR-0008](0008-workforce-provisioning-and-activation.md), [ADR-0012](0012-global-credential-recovery-proof.md), [ADR-0019](0019-owner-administration-and-import-only-roster.md).

## Context

An ACTIVE direct Hospital OWNER provisions workforce (staff and OSM) and patients as today. Invite links and assisted activation remain available for all three groups. The Product Owner has also approved a public `/register` flow: a provisioned person can enter a Thai national ID, and an eligible match can set a password without receiving an invite link. The national ID checksum is validated and the same ID is re-entered at completion.

This is an explicit, narrow exception to the first-credential ownership proof described in ADR-0008 and ADR-0012. The product decision accepts that a national ID is not proof that the person entering it owns the identity.

## Decision

The public flow has three identity outcomes: `FOUND` (continue with a short-lived capability and masked-name confirmation), `NOT_FOUND` (including every ineligible case), and `ALREADY_ACTIVE`. Rate-limited or unavailable service returns a generic retry message. The page discloses no Hospital, HN, role, contact data or unmasked name before password setup.

Eligibility is checked at lookup and again at completion. A person must have a PROVISIONED User with no auth subject or prior credential, no unresolved claim/reconciliation quarantine, and at least one eligible PROVISIONED relationship at an ACTIVE Hospital with self-registration enabled. Eligible relationships are MEMBER, OSM, and non-ended Patient relationships pending activation, created within the preceding 30 days. Any OWNER membership, ADMIN role, suspended/ended relationship, existing active invitation account, or other ineligible state returns the same NOT_FOUND response. A Hospital OWNER can disable the setting immediately; it defaults on.

The capability is single-use, expires after 10 minutes, is stored as a hash, and is bound to the exact eligible relationship IDs and `SELF_REGISTRATION` purpose. Workforce-only and mixed workforce/patient cases reuse `WorkforceActivation`; patient-only cases reuse `PatientActivation`. Mixed relationships activate one global credential once and then all relationships bound to the capability. Existing claim, provider-I/O, quarantine/reconciliation and per-User serialization controls remain in force. Invite, assisted activation, slips, patient access requests and child-owner onboarding are unchanged.

Persisted rate limits apply by IP hash, national-ID hash and global volume. Audits contain no PII. Workforce and patient rosters expose a filterable “ลงทะเบียนเอง” marker with the date. OWNER notification uses this roster badge because the repository has no in-app inbox/notification mechanism for this event.

The public page and its endpoints are no-store/noindex and send `Referrer-Policy: no-referrer`.

## Risk acceptance

The Product Owner explicitly accepts these risks for this capability:

1. Anyone holding a copy of a person's national ID card can register first and see the health data that the resulting account can reach.
2. The found/not-found answer discloses that an ID belongs to a person provisioned by the Hospital. For a patient, this reveals enrollment in the Hospital's NCD programme and is health data under PDPA section 26.

The partner agency must acknowledge this disclosure and its risks before production use with real data. Record that acknowledgement as a **G-01 / ก-25 production gate**; code, tests, and this product decision do not satisfy the gate.

## Consequences

- Owners can leave self-registration enabled or disable it in Hospital settings. Turning it off blocks new lookups and completion for that Hospital.
- An ID card copy can be used by another person to establish the first credential; the accepted risk is not eliminated by the checksum, masked name, rate limits or short-lived capability.
- Existing first-credential and recovery restrictions continue for every flow outside this capability. National ID is not a general ownership proof and this decision does not restore password recovery.
- Users who already have credentials are directed to login/recovery and advised to contact the Hospital immediately if the account is not theirs.
