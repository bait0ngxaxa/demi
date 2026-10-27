# Hospital workforce / OSM relationship compatibility

Confirmed Product Owner amendment — 2026-10-27.

- Hospital `OWNER` and `MEMBER` relationships are mutually exclusive with OSM relationships while either category has a non-ended relationship. This applies across **all Hospitals**, independently of Hospital/account status and profession (`DOCTOR`, `NURSE`, `COORDINATOR`, `OTHER`, including null/legacy values).
- `ACTIVE`, `PROVISIONED`, `INVITED` and `SUSPENDED` all conflict. `ENDED` is history and does not independently block onboarding into the other category. Retain historical relationships and roles.
- Persisted relationships determine compatibility. An orphan/historical `UserRole.HOSPITAL` or `UserRole.OSM` alone is not a workforce relationship. Resolve/reuse the same canonical Person/User; never create another identity to bypass the rule.
- Keep HOSPITAL + PATIENT, OSM + PATIENT, existing CAREGIVER combinations, multiple Hospital memberships, multiple OSM associations, ADMIN restrictions, Work/Personal separation, scope-based authorization and LINE presentation unchanged. Existing credential ownership and pending-Hospital trust rules still apply.
- Enforce symmetrically before single/bulk grants, repeated grants, OWNER invitations/acceptance, restoration, OWNER promotion, public Hospital approval and first activation/self-registration. Reject with a domain conflict inside the existing SERIALIZABLE transaction; retry serialization failures through the established infrastructure. A failed grant commits no role, relationship, activation credential, success audit or partial identity update. Bulk may persist its existing failure receipt.
- Check activation before provider effects and revalidate local finalization. Legacy mixed pending identities fail closed with a reconciliation outcome. Preserve provider reconciliation/compensation. Credential replacement is never a compatibility repair.
- Existing conflicting records require **explicit, separately authorized reconciliation**. This change does not remove roles, end/suspend relationships, revoke sessions, alter patient assignments, delete identities or rotate credentials automatically. Existing scope authorization is preserved; unsafe new grants and lifecycle transitions are blocked.

This amendment supersedes older examples allowing simultaneous Hospital workforce + OSM (including combined same-Hospital activation). Historical ADR/phase text remains evidence of the previous decision, not current permission.

## Conflict disclosure and bulk receipts

The global compatibility predicate is independent of what an actor may learn about the conflicting relationship. Category-specific feedback requires a current persisted ACTIVE direct OWNER of the ACTIVE target Hospital and a non-ended opposite-category relationship in that Hospital. Missing or ambiguous authority, cross-Hospital-only conflicts, activation and invitation paths without that proof use generic feedback; no external Hospital, category, profession, status or identity detail is included.

Bulk stores `ROLE_INCOMPATIBLE` only after the same local proof is rechecked in the failure-receipt transaction. Other conflicts use `CONFLICT`; invalid rows and transient failures retain `INVALID_ROW` and `UNAVAILABLE`. Receipts preserve the result established at submission time, including legacy reason values, and are replayed only after current OWNER authorization is rechecked. A single rejected row does not roll back successful rows.

## Read-only audit for authorized reviewers

Use [hospital-osm-compatibility.sql](../../scripts/diagnostics/hospital-osm-compatibility.sql) with an approved PostgreSQL connection and a read-only role:

```sh
psql -X --set=ON_ERROR_STOP=1 --file=scripts/diagnostics/hospital-osm-compatibility.sql
```

Supply connection credentials through the approved environment/service configuration, not command-line arguments or logs. The script explicitly starts a repeatable-read, read-only transaction. It selects only opaque User/relationship IDs, account/relationship statuses, profession, membership type and Hospital scope/code/status. No plaintext National ID, identity hash, person name, password, token, provider identifier or Patient data is selected. Treat the output as restricted operational data.

- `CURRENT_CONFLICT`: at least one non-ended relationship in **each** category, regardless of UserRole presence or Hospital status. Status counts and exact Hospital scopes support authorized review.
- `ENDED_ONLY_HISTORY`: both categories exist only as ended history; not a current conflict.
- `HISTORICAL_CATEGORY_OVERLAP`: one category has non-ended relationships and the other has ended history only; not a current conflict.
- Users with records in only one category are omitted.

Review each current conflict with the responsible authorized business/security owner before deciding which relationship, if any, should end. Patient assignments, clinical resource ownership, credential state and audit history need an explicit decision; this query makes no changes and provides no automated repair. Production data has not been inspected by this remediation.

## Regression evidence

`tests/integration/workforce-onboarding-v2.integration.test.ts` covers both directions, all professions/null, non-ended statuses, same/cross-Hospital conflicts, ENDED history, Patient combinations, same-category multiple Hospitals, atomic rollback, bulk receipt/replay behavior and real PostgreSQL concurrent grants. It also covers mixed pending activation, provider-start/finalization races, compensation and restoration. Child OWNER/public approval, self-registration and takeover recovery have focused cases in their existing integration suites. Transport tests preserve safe Thai feedback and generic handling of unrelated errors.
