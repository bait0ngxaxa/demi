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

The capability is single-use, expires after 10 minutes, is stored as a hash, and is bound to the exact eligible relationship IDs and `SELF_REGISTRATION` purpose. Workforce-only and mixed workforce/patient cases reuse `WorkforceActivation`; patient-only cases reuse `PatientActivation`. Mixed relationships activate one global credential once and then all relationships bound to the capability. Completion records `User.identityAssurance = SELF_REGISTERED`; a later verified REC-1 reset records `HOSPITAL_PROOFED`. Existing claim, provider-I/O, quarantine/reconciliation and per-User serialization controls remain in force. Invite, assisted activation, slips, patient access requests and child-owner onboarding are unchanged.

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
- Existing first-credential and recovery restrictions continue for every flow outside this capability. National ID is not a general ownership proof. The narrow OWNER/ADMIN-mediated reset exception is recorded in the REC-1 cross-reference below.
- Users who already have credentials are directed to login; a forgotten password or suspected takeover is handled through the verified Hospital reset process in REC-1.

## Addendum UM-1 — OWNER user management and suspected takeover (Product Owner, 2026-10-22)

Decisions UM-D1..UM-D7 are recorded in [WB_ALIGNMENT_DECISIONS.md](../requirements/WB_ALIGNMENT_DECISIONS.md) §UM-1; OWNER guide: [hospital-owner-user-management.md](../guides/hospital-owner-user-management.md). They add an OWNER-only directory (`/app/users`) and a single detail layout over staff, OSM and Patient records of the exact ACTIVE Hospital.

- **Delete vs remove.** "ลบรายการ" hard-deletes only a never-activated, data-free, single-Hospital record (the usual cause is a wrong national ID, which is never editable). The check is one query per kind backed by a registry that classifies every relation of User, Person, PatientProfile, PatientHospitalRelationship, HospitalMembership and OsmHospitalRelationship; an unknown relation or a refused foreign key makes the record not deletable. An unmodified Excel import snapshot counts as part of the record (UM-D7). Every other case uses the existing ENDED release or Phase F end of care.
- **Suspected takeover.** Because a national ID is not ownership proof, an OWNER can report "บัญชีนี้ไม่ใช่เจ้าของจริง". One transaction sets the User to `SUSPENDED` (every access path requires ACTIVE, so access stops on the next request), suspends this Hospital's ACTIVE staff/OSM relationships, revokes unused activation links, unlinks a LINE binding made after the first credential and records `UserTakeoverLock` plus an audit. Provider session revocation then runs outside database locks through a Supabase admin ban, the only provider path that does not need the user's JWT; issued access tokens stay valid until they expire but are refused by the application. A non-confirmed provider result leaves the lock in `RECONCILIATION_REQUIRED` and the action can be repeated.
- **Boundaries.** A Patient relationship has no suspension state, so the account lock is the block for Patients; `activePatientHospitalRelationshipWhere` is unchanged. The lock is global, so an OWNER may only lock a Person related to that Hospital alone (the E3 rule), never their own account or an OWNER membership. A suspected-takeover lock is now recoverable through REC-1; an OWNER target or another out-of-scope account must be reset by a platform ADMIN.

## Addendum RA-1 — Retire patient account-access requests (Product Owner, 2026-10-22)

This addendum supersedes the access-request clause in Decision paragraph 3 above, which said patient access requests were unchanged.

Every Patient must first be added to the Hospital roster by its OWNER through Excel import under [ADR-0019](0019-owner-administration-and-import-only-roster.md). The Patient then self-registers by national ID under this ADR or uses an OWNER-issued invite/assisted activation. The public “ขอใช้บัญชี DEMI” request and the OWNER account-access review inbox are retired because they duplicate these supported account-establishment paths.

The public `/patient/access-request` page, OWNER `/app/patients/access-requests` workspace, and their services, actions, schemas, and policy are removed. No redirect is added; removed paths resolve through the normal 404.

No destructive migration is made. `PatientAccessRequest`, its enums, columns, and foreign keys remain so existing rows and audits remain readable to DBAs. Existing unresolved rows are left unchanged and inert: no new request is accepted and no application workflow reviews, issues activation from, or advances those rows. Existing activation links remain usable to establish the Patient account; completing a legacy linked activation does not update the retired request. End-of-care continues revoking an unclaimed activation and unlinking it from the request while preserving the request row. The user-record deletion relation registry continues classifying retained request relations as data that blocks hard deletion.

## Cross-reference — REC-1 mediated reset and takeover reclaim (2026-10-22)

[ADR-0012](0012-global-credential-recovery-proof.md) adds a narrowly scoped OWNER/ADMIN-mediated reset for credentialed accounts, including self-registered accounts and suspended accounts under suspected-takeover locks. It requires recorded identity verification, the target's own National ID and a new password, and the existing claim/provider/finalize quarantine. This cross-reference does not make National ID a general ownership proof or enable any other recovery path.
