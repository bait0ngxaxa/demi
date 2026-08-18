# Phase 12B.0 Hospital Lifecycle Working Prototype

สถานะ: implemented as a narrow, provisional prototype for requirement validation. พฤติกรรมในเอกสารนี้ยังไม่ใช่ customer-approved production policy และไม่ควรตีความเป็น final Hospital suspension/restore semantics

## Scope

Phase 12B.0 adds a bounded Platform Admin Hospital governance surface. An authenticated, active Platform `ADMIN` can inspect Hospitals already in the governed lifecycle and perform only these transitions:

```text
ACTIVE   -> SUSPENDED
SUSPENDED -> ACTIVE
```

The only domain lifecycle field changed is `Hospital.status`. `PENDING_VERIFICATION` remains owned by Hospital onboarding and is never a suspend/restore target.

## Routes

- `/app/admin/hospitals` — bounded governance directory containing `ACTIVE` and `SUSPENDED` Hospitals.
- `/app/admin/hospitals/[hospitalId]` — exact-ID governance detail page.
- The protected application navigation exposes the directory only as a UX convenience for actors that pass the governance read capability check.

The detail page contains only Hospital name, Hospital code, lifecycle status, `createdAt`, and `updatedAt`. It does not expose Patients, clinical information, assignments, owner counts, or relationship lists. A pending Hospital is read-only/not-applicable on this route.

## Authorization

The governance capability names are:

- `hospital:read-governance`
- `hospital:suspend`
- `hospital:restore`

The policy allows only an actor with Platform `Role.ADMIN`. Hospital Owner, Hospital MEMBER, OSM, PATIENT, hierarchy membership, parent/child metadata, and Hospital relationships do not authorize governance. The browser supplies only the exact Hospital ID and the stale-write value; it never supplies actor identity, role, authority, target status, or accessible-Hospital scope.

Mutation services re-read the actor User inside the authoritative transaction and require that the User exists, is `ACTIVE`, and currently has `Role.ADMIN`.

## Suspend and restore contracts

`suspendHospital()` and `restoreHospital()` are separate operations. They validate `hospitalId` and `expectedUpdatedAt`, load the exact Hospital by opaque ID inside the mutation boundary, validate the expected current status, and update only `Hospital.status`.

- Suspend accepts only `ACTIVE` and changes it to `SUSPENDED`.
- Restore accepts only `SUSPENDED` and changes it to `ACTIVE`.
- Invalid transitions, pending targets, unknown IDs, forbidden actors, and stale versions fail safely without a successful audit event.
- No reason, approval, effective date, grace period, notification, or background workflow is required or created.

## Stale writes and transactions

The service uses the existing serializable transaction and bounded retry convention. It re-reads the actor and Hospital inside the transaction, compares the submitted `expectedUpdatedAt`, and uses a conditional `updateMany` on the exact Hospital ID, expected status, and current `updatedAt`. A stale request returns conflict and cannot silently overwrite the current state.

The status update and bounded audit event are written in the same transaction. A successful transition cannot commit without its corresponding audit event.

## Audit events

Successful transitions record:

- `hospital.suspended`
- `hospital.restored`

Both use `resourceType: Hospital`, the exact Hospital ID, and minimal metadata equivalent to `fromStatus` and `toStatus`. No credentials, tokens, identity data, Patient data, clinical data, or browser payload is recorded.

## No-cascade guarantee

Hospital governance does not modify or reconstruct any lower-level state. In particular it does not change:

- User status, UserRole, credentials, provider identity, or sessions;
- HospitalMembership or `WorkforceActivation`;
- `OsmHospitalRelationship`;
- `PatientHospitalRelationship` or `PatientOsmAssignment`;
- Appointments, Screening, Goal Plans, Follow-ups, Baseline, Evidence, or clinical history.

OSM assignments remain structurally current, including `endedAt`, while the Hospital is suspended. Appointments and clinical/history records remain stored and unchanged. There is no global session revocation; subsequent server authorization reads authoritative Hospital state and fail closed for the suspended scope.

## Existing policy consequence

The prototype relies on the existing Hospital-active predicates in the workforce, Patient directory, OSM assignment, and Appointment boundaries. While a Hospital is `SUSPENDED`, those existing Hospital-scoped operations reject or return no authorized target. After restore, a preserved scope becomes usable again only if its own User, membership, OSM relationship, assignment, and other existing predicates still pass. Restore does not reactivate or repair any lower-level state.

## Multi-Hospital isolation

All reads and mutations use the exact opaque Hospital ID. Integration coverage suspends one Hospital while a second Hospital remains `ACTIVE`, keeps its memberships, OSM relationship, assignments, appointments, and access unchanged, and verifies the same isolation through restore.

## Tests and validation

Focused unit coverage covers governance policy, bounded projections, exact status transitions, actor revalidation, stale/invalid transitions, audit payloads, and validated Server Actions. PostgreSQL integration coverage covers bounded reads, atomic audited transitions, no-cascade preservation, workforce/Patient/OSM/Appointment fail-closed behavior, lower-level invalid state after restore, and multi-Hospital isolation.

The repository integration workflow completed with 16 test files and 121 passing tests. No Prisma schema or migration was added.

## Explicit non-goals

Phase 12B.0 does not implement hard delete, Hospital profile editing, merge, hierarchy inheritance, Owner governance, Owner counts, Owner transfer, User account suspend/restore, password recovery, credential reset, global session revocation, identity reconciliation, Patient transfer, OSM reassignment, automatic assignment ending, Appointment continuity workflow, notifications, reasons, approval workflow, scheduled suspension, emergency access, generic IAM/RBAC, support console, or workflow engine.

## Remaining open customer requirements

Owner governance and account recovery remain deferred to Phase 12C. Final suspension/restore semantics, business continuity for scheduled Appointments, operational communications, approval and reason requirements, session/account consequences, and other unresolved governance policy questions remain provisional/open requirements.
