# Phase 11C — OSM Relationship Lifecycle and Patient Assignment Consequences

## 1. Status / Objective

- **Status:** Analysis complete; no Phase 11D.0 implementation started.
- **Phase:** 11C — OSM Relationship Lifecycle + Patient Assignment Consequence Analysis.
- **Scope:** Requirements, current-state verification, option analysis, and a provisional future implementation boundary only.
- **Priority:** Correctness > Security > Performance > Maintainability > Speed.

The central unresolved question is what should happen when a Hospital wants to
suspend an `OsmHospitalRelationship` while that relationship still has current
`PatientOsmAssignment` rows.

This document separates accepted architecture, direct current implementation
evidence, direct legacy evidence, inference, provisional prototype
recommendations, and open customer requirements. A recommendation in this
document is not customer approval and must not be treated as an implemented
capability.

### Evidence labels

| Label | Meaning |
| --- | --- |
| **Accepted architecture** | A decision already established by an accepted ADR, baseline, or closed phase contract. |
| **Direct current implementation evidence** | Behavior visible in the current schema, migration, source code, route, or test. |
| **Direct legacy evidence** | Behavior observed in the pinned legacy checkout; terminology/workflow evidence only. |
| **Inference** | A conclusion derived from direct evidence but not itself an explicit accepted requirement. |
| **Provisional prototype recommendation** | A deliberately narrow proposal for future requirement validation. |
| **Open customer requirement** | A question that still needs customer/business confirmation. |
| **Rejected legacy architecture** | Historical technical behavior that must not be copied into the rewrite. |

## 2. Sources inspected

### Current documentation and accepted architecture

- [`docs/CONTEXT.md`](../CONTEXT.md)
- [`docs/architecture/DEMI_ARCHITECTURE_BASELINE.md`](../architecture/DEMI_ARCHITECTURE_BASELINE.md)
- [`docs/adr/0001-person-and-user-identity.md`](../adr/0001-person-and-user-identity.md)
- [`docs/adr/0002-role-capability-scope-authorization.md`](../adr/0002-role-capability-scope-authorization.md)
- [`docs/adr/0003-hospital-led-onboarding.md`](../adr/0003-hospital-led-onboarding.md)
- [`docs/adr/0005-server-side-application-boundary.md`](../adr/0005-server-side-application-boundary.md)
- [`docs/adr/0006-transactional-business-operations.md`](../adr/0006-transactional-business-operations.md)
- [`docs/adr/0007-client-transport-and-mobile-ready-architecture.md`](../adr/0007-client-transport-and-mobile-ready-architecture.md)
- [`docs/adr/0008-workforce-provisioning-and-activation.md`](../adr/0008-workforce-provisioning-and-activation.md)
- [`docs/phases/PHASE_4A_WORKFORCE_PROVISIONING.md`](./PHASE_4A_WORKFORCE_PROVISIONING.md)
- [`docs/phases/PHASE_4B_WORKFORCE_PROVISIONING.md`](./PHASE_4B_WORKFORCE_PROVISIONING.md)
- [`docs/phases/PHASE_6A_PATIENT_ACCESS_AND_ASSIGNMENT.md`](./PHASE_6A_PATIENT_ACCESS_AND_ASSIGNMENT.md)
- [`docs/phases/PHASE_11A_WORKFORCE_LIFECYCLE_HOSPITAL_GOVERNANCE_REQUIREMENTS.md`](./PHASE_11A_WORKFORCE_LIFECYCLE_HOSPITAL_GOVERNANCE_REQUIREMENTS.md)
- [`docs/phases/PHASE_11B0_STAFF_MEMBERSHIP_LIFECYCLE_WORKING_PROTOTYPE.md`](./PHASE_11B0_STAFF_MEMBERSHIP_LIFECYCLE_WORKING_PROTOTYPE.md)

### Current implementation and tests

- [`prisma/schema.prisma`](../../prisma/schema.prisma)
- Workforce provisioning, detail projection, activation, and policy under [`src/modules/workforce/`](../../src/modules/workforce/)
- Server-resolved actor state under [`src/modules/auth/`](../../src/modules/auth/)
- Patient assignment and assignment query services under [`src/modules/patient-assignment/`](../../src/modules/patient-assignment/)
- Patient relationship-scoped read predicates under [`src/modules/patient-directory/`](../../src/modules/patient-directory/)
- Bounded audit service and schema under [`src/modules/audit/`](../../src/modules/audit/)
- [`prisma/migrations/20260814100000_workforce_provisioning/migration.sql`](../../prisma/migrations/20260814100000_workforce_provisioning/migration.sql)
- [`prisma/migrations/20260816100000_patient_osm_assignment/migration.sql`](../../prisma/migrations/20260816100000_patient_osm_assignment/migration.sql)
- [`tests/integration/workforce.integration.test.ts`](../../tests/integration/workforce.integration.test.ts)
- [`tests/integration/patient-osm-assignment.integration.test.ts`](../../tests/integration/patient-osm-assignment.integration.test.ts)
- Current detail surface: `app/app/workforce/[kind]/[relationshipId]/page.tsx`
- Current Patient assignment surface: `app/app/patients/[relationshipId]/assignment/page.tsx`
- Current OSM assigned directory: `app/app/patients/assigned/page.tsx`

There is no `src/modules/patient/` directory in this repository. Patient
behavior is split across `patient-provisioning`, `patient-activation`,
`patient-directory`, `patient-assignment`, `patient-baseline`,
`patient-evidence`, and clinical modules. This was treated as an inspection
layout fact, not as a reason to introduce a new module.

### Pinned legacy checkout

The local checkout inspected was:

```text
C:\Users\Bait0ng\Desktop\legacy-demi\demi-plus-web-v2
commit 7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e
```

Relevant files included `lib/supabase/queries.ts`, staff list/detail and
deactivation flows, temporary OSM verification, emergency registration, the
staff ID-card assignment page, Patient registration/import, Patient coach
updates, and Hospital hierarchy/active-state screens. The same pinned commit
is referenced in the earlier phase documents and at
[`raviut-max/demi-plus-web-v2@7a5510ee`](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e).

## 3. Current accepted architecture

**Accepted architecture:**

- `Person` is the real-human identity. `User` is the application account.
- A User account lifecycle is separate from a relationship lifecycle.
- `Role.OSM` is separate from `OsmHospitalRelationship`.
- `OsmHospitalRelationship` represents one User + one Hospital + OSM association state.
- `HospitalMembership` is the staff/Owner relationship and is not an OSM relationship.
- `Hospital.status` is the Hospital organization lifecycle and is not an OSM relationship lifecycle.
- `PatientHospitalRelationship` is the Hospital-specific Patient relationship.
- `PatientOsmAssignment` is the explicit Patient responsibility relationship and preserves assignment history.
- Role, capability, and exact resource scope are evaluated server-side and fail closed.
- Parent/child/sibling Hospital metadata is not authorization.
- OSM geography, Area/Village scope, Patient ownership, and clinical responsibility are not implied by an OSM–Hospital relationship.

The current relationship map is intentionally separate:

```text
Person
  └─ User
       ├─ UserRole(OSM)
       └─ OsmHospitalRelationship(User, Hospital, status)

PatientProfile
  └─ PatientHospitalRelationship(Patient, Hospital)
       └─ PatientOsmAssignment(current/history, osmUserId)
```

The last edge points to the OSM User as the assigned responsible actor. It
does not turn `PatientOsmAssignment` into a second OSM–Hospital relationship
model.

## 4. Current OSM relationship implementation

### 4.1 Schema and persistence

**Direct current implementation evidence:**

`OsmHospitalRelationship` contains:

```text
id
userId
hospitalId
status: MembershipStatus
createdAt
updatedAt
```

`MembershipStatus` currently contains `PROVISIONED`, `INVITED`, `ACTIVE`, and
`SUSPENDED`. There is no `ENDED` or `TERMINATED` relationship state.

The database enforces `unique(userId, hospitalId)` and indexes the relationship
by Hospital/status and User/status. Its foreign keys reference `User` and
`Hospital`; deleting either parent cascades to this relationship row. This
supports an exact direct association and does not add geography, Patient,
assignment, or clinical fields.

### 4.2 Provisioning and activation

**Direct current implementation evidence:**

- `provisionOsm()` authorizes an active direct Hospital Owner, resolves/reuses `Person` and `User`, upserts `Role.OSM`, and creates or reuses only the exact `OsmHospitalRelationship`.
- A new non-active User receives a `PROVISIONED` relationship and a workforce activation capability.
- An existing active User with a valid authentication mapping receives an active relationship without re-activating the account or calling the provider again.
- Reusing an existing `INVITED` or `SUSPENDED` OSM relationship is rejected. Provisioning does not silently restore it.
- A provisioned relationship can become active during the existing workforce activation finalization when the target User proves credential ownership. Suspended relationships are not included in that activation transition.
- Workforce activation finalization changes the User account and eligible provisioned workforce relationships as part of its own activation contract. It is not a relationship restore operation.

### 4.3 Current read surface

**Direct current implementation evidence:**

- `getWorkforceDetail()` resolves the exact relationship inside the active direct Owner Hospital scope.
- The bounded OSM detail includes display name, Hospital, Hospital status, User account status, relationship status, activation projection, and `relationshipUpdatedAt`.
- OSM detail actions are currently all `false`; the current UI explicitly renders OSM detail as read-only.
- The current workforce capability vocabulary has membership lifecycle names for Staff (`membership:suspend` and `membership:restore`) and `osm:provision`, but no OSM relationship lifecycle capability.
- No current application service, Server Action, Route Handler, or UI control implements OSM relationship suspend/restore.

The Staff membership lifecycle implementation must not be copied by name alone:
`HospitalMembership` and `OsmHospitalRelationship` are different relationship
types with different Patient-assignment consequences.

## 5. Current Patient–OSM assignment implementation

### 5.1 Data model and current-state rule

**Direct current implementation evidence:**

`PatientOsmAssignment` stores:

```text
id
patientHospitalRelationshipId
osmUserId
assignedByUserId
createdAt
endedAt
endedByUserId
```

`PatientHospitalRelationship` is the parent relationship and has a unique
`(patientProfileId, hospitalId)` pair. A current assignment is the row with
`endedAt IS NULL`. The migration creates a PostgreSQL partial unique index on
`patientHospitalRelationshipId WHERE endedAt IS NULL`, enforcing at most one
current OSM per Patient–Hospital relationship.

The assignment row has `RESTRICT` foreign keys to the Patient–Hospital
relationship, assigned OSM User, assigning User, and optional ending User.
It does **not** contain `osmHospitalRelationshipId` and does **not** have a
foreign key directly to `OsmHospitalRelationship`.

### 5.2 Assignment, reassignment, and ending behavior

**Direct current implementation evidence:**

- Only an active `HOSPITAL` actor with a direct active `OWNER` membership in the exact active Hospital and `patient:assign-osm` may assign, unassign, or reassign.
- The target OSM must have `User.status = ACTIVE`, `Role.OSM`, an active exact-Hospital `OsmHospitalRelationship`, and an active target Hospital.
- Assigning the same current OSM is a `NOOP`.
- Reassignment updates the previous current row with `endedAt` and `endedByUserId`, then creates a new row with `createdAt` and `assignedByUserId`.
- Unassignment ends the current row and does not delete it.
- Assignment state changes and their successful audit event are persisted in one serializable transaction with bounded retry for retryable conflicts.
- Current audit actions are `patient.osm_assigned`, `patient.osm_reassigned`, and `patient.osm_unassigned`.
- Current assignment audit metadata uses bounded opaque identifiers and excludes Patient names and HN values in the integration coverage.

The service re-checks the actor, Hospital, Patient relationship, target User,
role, exact OSM relationship, and active states inside the transaction. It does
not trust the browser-selected actor, Hospital, User, or assignment state as
authority.

### 5.3 Assignment routes that already exist

**Direct current implementation evidence:**

- Hospital Owner assignment management exists at `/app/patients/[relationshipId]/assignment`.
- The Patient detail page links an authorized Owner to that per-Patient assignment surface.
- OSM assigned read exists at `/app/patients/assigned`, but this is an OSM assigned-Patient read surface, not a Hospital Owner's OSM-specific assignment report.
- No existing route was found that lists all current Patients for one selected OSM for a Hospital Owner.

## 6. Current access consequences of an inactive OSM relationship

The following is current behavior, not a customer-approved lifecycle rule.

| Situation | Current observed/derived behavior | Evidence classification |
| --- | --- | --- |
| Current `PatientOsmAssignment` points to the OSM and has `endedAt = NULL` | No current OSM lifecycle operation updates or ends the row when the OSM relationship becomes inactive. It remains technically current. | Direct current code/schema evidence; the absence of an OSM lifecycle writer is verified. |
| OSM assigned directory/detail access | Access is denied when the exact OSM relationship is inactive. The assigned query requires the target Hospital active, the exact OSM–Hospital relationship active, the User active with `Role.OSM`, and a current assignment for that OSM User. The integration test changes the relationship to `SUSPENDED` and observes an empty assigned directory. | Direct current implementation/test evidence. |
| OSM User account | Relationship suspension alone does not change `User.status`, `authSubject`, or `Role.OSM`; a User that remains `ACTIVE` still resolves through the application account boundary. | Direct current code evidence. |
| Hospital Owner Patient access | Direct active Hospital Owner access is based on the Hospital membership and active Hospital, not on the assigned OSM relationship. The Owner can still reach the Patient/Hospital context. | Direct current query evidence. |
| Owner assignment management | The current assignment management projection selects the current assignment by `endedAt = NULL` and displays the assigned OSM name without requiring the OSM relationship to be active. Candidate selection does exclude inactive OSM relationships. | Direct current query evidence. |
| Automatic replacement | No other OSM is selected and no assignment is automatically reassigned. | Direct current code/test evidence. |
| History rewrite | No assignment history is rewritten by the current inactive-relationship access predicates. | Direct current code/schema evidence. |
| Restore-like effect | If a relationship were manually returned to `ACTIVE` while its assignment row remained current, the existing access predicates would make that assignment eligible again. No supported restore operation exists, so this is an inference about predicate behavior, not an accepted restore contract. | Inference; not customer-approved. |

The resulting state can therefore be described as: **the assignment remains
current in persistence, while OSM access is fail-closed**. That is useful
security behavior, but it does not by itself resolve whether the business
should allow an operator to create that state through a lifecycle mutation.

## 7. Legacy evidence

### 7.1 What the pinned legacy system did show

**Direct legacy evidence:**

- The inspected legacy model used a single `users.role`, a single `users.hospital_id`, and account-level `users.is_active`.
- OSM appeared as `role = 'osm'` and used a `doctors` row for workforce details; the inspected paths did not contain an independent `OsmHospitalRelationship` table or relationship lifecycle.
- `deactivateStaff()` and `restoreStaff()` changed `users.is_active` and `doctors.is_active`, including when the account was an OSM. This is an account/profile operation, not an independent OSM–Hospital relationship transition.
- Temporary OSM flows used `is_temporary_id`, generated/checksum-shaped identifiers, later identity replacement, and an `is_verified` flag.
- Emergency registration inserted an immediately active User/doctor shape and an ID-card assignment record.
- Patient registration/import and the update-coach batch flow used a single `profiles.coach_id`; coach selection could be by name and the update wrote directly to the Patient profile.
- The inspected Patient coach/assignment paths did not provide an append-only Patient–OSM assignment history or a confirmed automatic reassignment rule when a coach became inactive.
- Hospital screens used `hospitals.is_active`, `type`, and `parent_id`; legacy helper logic expanded accessible Hospital IDs across parent/child relationships.

### 7.2 What legacy does not prove

**Direct legacy evidence / inference boundary:**

The legacy repository does **not** model an independent OSM–Hospital
relationship lifecycle that can answer the Phase 11C question. Its account-level
`is_active` behavior cannot be used to infer whether an OSM–Hospital relationship
may be suspended with active Patient assignments, whether assignments remain
current, or whether restore should reopen access.

The legacy coach field also cannot prove that a coach was an OSM, that the
relationship was Hospital-specific, or that it represented authorization.

### 7.3 Rejected legacy architecture

The following are historical implementation patterns, not rewrite requirements:

- one account-level `is_active` flag as the lifecycle of every role and Hospital relationship;
- one `hospital_id` as the multi-Hospital model;
- direct browser Supabase writes and client-derived authorization;
- predictable or derived passwords and immediate account activation;
- fake/temporary identity values as a substitute for identity proofing;
- mutable single `coach_id` as Patient assignment history;
- silent hierarchy expansion as authorization;
- hard deletion of User/doctor rows as ordinary workforce removal.

## 8. OSM lifecycle candidate operations

### 8.1 Relationship suspend

The candidate transition is exactly:

```text
OsmHospitalRelationship: ACTIVE → SUSPENDED
```

It must be scoped to one exact `OsmHospitalRelationship` and Hospital. It must
not change the linked User account, `Role.OSM`, any `HospitalMembership`, any
other Hospital relationship, any Patient role, or any assignment row unless a
separate customer-approved assignment operation is explicitly chosen.

### 8.2 Relationship restore

The candidate transition is:

```text
OsmHospitalRelationship: SUSPENDED → ACTIVE
```

The strong default is that the linked User must already be `ACTIVE`. Restoring
the relationship is not User account recovery, credential reset, activation
issuance, or role creation.

### 8.3 Remove/delete

Hard deletion is not a lifecycle operation recommended by this phase. The
current schema has no direct incoming foreign key from `PatientOsmAssignment`
to `OsmHospitalRelationship`, so deleting the relationship row itself is not
necessarily rejected by that FK. The assignment rows retain `osmUserId` and
the Patient–Hospital relationship, but deletion removes the exact relationship
row that documented the OSM–Hospital association. It would therefore weaken
historical reconstruction even if the database permits the delete.

By contrast, deleting the User is constrained by `PatientOsmAssignment.osmUserId`
and other restrictive historical references. Persistence `onDelete` behavior is
not authorization to expose a delete operation.

No new ended/terminated state is added in Phase 11C. Retention, relationship
closure, and any future distinct terminal state remain open requirements.

### 8.4 Move/transfer

OSM transfer must not be implemented as `update hospitalId`. The current model
supports multiple exact relationships for one User, so a future transfer could
involve a source relationship lifecycle, target relationship creation, and
explicit Patient assignment resolution. Source/target approval and assignment
consequences remain open. Patients must not move silently across Hospitals.

### 8.5 Multiple Hospital relationships

The data model can represent:

```text
User
  ├─ OsmHospitalRelationship → Hospital A
  └─ OsmHospitalRelationship → Hospital B
```

This is an accepted data capability for identity reuse. It is not a confirmed
cross-Hospital operating workflow or shared assignment scope.

## 9. Suspend-with-active-assignments option analysis

The active-assignment count must be calculated in the exact target Hospital:

```text
PatientOsmAssignment.osmUserId = target User
AND PatientOsmAssignment.endedAt IS NULL
AND PatientHospitalRelationship.hospitalId = target Hospital
```

This avoids counting assignments belonging to another Hospital relationship of
the same User.

### Option A — Block suspension

**Proposed behavior:** If the count is greater than zero, reject
`ACTIVE → SUSPENDED`. The operator must first explicitly end, unassign, or
reassign each current Patient assignment using an approved assignment path.

**Advantages:**

- avoids intentionally creating current assignments that point to an unavailable OSM relationship;
- does not invent a replacement OSM or a new responsibility owner;
- keeps operator responsibility explicit;
- preserves all assignment history;
- has a small state-machine surface and a clear conflict explanation;
- is reversible and easy to demonstrate during requirement validation.

**Disadvantages:**

- adds operational steps and depends on the existing Patient assignment workflow;
- may block an urgent operational suspension;
- requires the detail UX to expose the unresolved assignment count clearly;
- does not by itself answer who handles an emergency or break-glass case.

**Provisional prototype assessment:** This is the smallest safe default for a
normal operational lifecycle prototype, subject to customer confirmation.

### Option B — Allow suspension and preserve assignments

**Proposed behavior:** Change the relationship to `SUSPENDED`, leave every
current `PatientOsmAssignment` row unchanged, and rely on current access
predicates to deny OSM Patient access.

**Advantages:**

- emergency suspension is operationally easy;
- assignment history and the current assigned person remain visible in data;
- no automatic responsibility reassignment is introduced.

**Consequences and risks:**

- a row remains logically current while its OSM relationship is unavailable;
- a Patient may appear assigned to an unavailable OSM;
- the current Owner assignment view may continue to display that OSM as the current assignee;
- restoring the relationship could implicitly restore access to old current assignments;
- reporting and UX would need a separate “unavailable assignee” state;
- the prototype would encode a meaningful operational ambiguity without a confirmed requirement.

**Provisional prototype assessment:** Security fail-closed behavior is good,
but the business state is too ambiguous for the minimum normal lifecycle
prototype unless the customer explicitly accepts preserved current assignments.

### Option C — Explicit assignment resolution during suspension

**Proposed UX shape:**

```text
Suspend OSM
  → show N current Patient assignments
  → operator resolves each assignment
  → relationship suspension becomes available
```

This is not a different state invariant from Option A. It is a richer operator
workflow around the same rule: the relationship status does not change until
the exact-Hospital current assignment count reaches zero. It can be considered
in a later UX slice without creating a generic workflow engine or a bulk
reassignment feature.

### Option D — Automatic end or automatic reassignment

Automatically ending assignments changes responsibility without an explicit
Patient-work operator decision. Automatically selecting a replacement is even
higher risk: it could silently change operational or clinical responsibility,
choose an unsuitable OSM, cross a Hospital boundary, or create a false audit
trail. The current repository and legacy evidence provide no strong confirmed
requirement for those behaviors.

**Rejected for the prototype:** no automatic ending, automatic unassignment,
automatic reassignment, automatic replacement selection, or automatic transfer.

## 10. Provisional prototype recommendation

**Provisional prototype recommendation — not customer-approved:** Use Option A
for the normal OSM relationship lifecycle:

```text
if activePatientAssignments > 0:
    reject suspension with a safe conflict
    preserve OsmHospitalRelationship
    preserve PatientOsmAssignment rows
    write no success lifecycle audit event
else:
    allow ACTIVE → SUSPENDED
```

This recommendation minimizes unintended Patient responsibility changes,
preserves reconstructable assignment history, avoids automatic reassignment,
and is easy to demonstrate and discuss with Hospital stakeholders. It does not
answer the emergency-suspension requirement and must not be presented as a
permanent customer rule.

Under this recommendation, “active assignment” means the implementation's
current-state rule (`endedAt IS NULL`) in the exact target Hospital, even if
legacy/manual data has already become inconsistent with the OSM relationship
status. A future service should fail safely on such a count rather than hide
or rewrite the inconsistency.

## 11. Restore semantics

### 11.1 User account precondition

**Provisional default aligned with the Staff lifecycle boundary:**

- restore is allowed only when linked `User.status = ACTIVE`;
- `User.status = PROVISIONED`, `INVITED`, or `SUSPENDED` is a safe conflict/deny;
- restore does not recover the User account, establish a provider mapping, reset credentials, or issue an activation capability;
- account recovery remains a separate operation with its own authority and audit requirements.

### 11.2 Assignment consequences under the recommended BLOCK policy

Under the supported BLOCK flow, a relationship cannot become suspended while
current assignments remain. Therefore:

- restore does not recreate any previous assignment;
- ended assignment rows remain ended and historical;
- a restored OSM is only eligible for future assignment after all current eligibility predicates pass;
- restore does not change `PatientOsmAssignment`, `PatientHospitalRelationship`, Patient role, or Patient data.

If an active assignment exists alongside a suspended relationship because of
legacy/manual data or an operation outside the future service, restore must not
silently resolve or recreate work. That is an inconsistent state requiring a
separate reconciliation decision.

### 11.3 Contrast with PRESERVE-assignment policy

Under Option B, restoring `SUSPENDED → ACTIVE` while a row still has
`endedAt = NULL` would make the old assignment eligible again under the current
access predicate. That is implicit access reactivation and potentially an
implicit return of responsibility. It may be acceptable only if the customer
explicitly approves that semantic; it is not a safe assumption for the
prototype.

### 11.4 Assignment eligibility after restore

The current candidate query and assignment service require all of the following
for a restored OSM to be eligible in a target Hospital:

- `User.status = ACTIVE`;
- `Role.OSM` exists;
- `OsmHospitalRelationship.status = ACTIVE` for the exact target Hospital;
- target `Hospital.status = ACTIVE`;
- the assignment actor has the existing direct active Hospital Owner scope and `patient:assign-osm`.

No Area, Village, geographic catchment, Hospital hierarchy, or network scope is
added here.

## 12. Multi-Hospital OSM invariants

For a User with relationships in two Hospitals:

```text
User.status = ACTIVE
Role.OSM exists
  ├─ relationship A: Hospital A, ACTIVE
  └─ relationship B: Hospital B, ACTIVE
```

Suspending relationship A must affect only the exact A row. It must not:

- suspend relationship B;
- change `User.status`;
- remove `Role.OSM`;
- alter any `HospitalMembership`;
- alter Patient role or Person identity;
- alter assignments in Hospital B;
- transfer Hospital A Patients to Hospital B;
- rewrite Hospital A historical assignment rows;
- grant Hospital A authority to Hospital B or vice versa.

This isolation follows the unique User/Hospital relationship model and the
accepted direct-scope authorization boundary. A future network-level operation
would require a separate explicit capability and requirement.

## 13. Role / account / relationship separation

### Role.OSM

**Accepted architecture / direct current evidence:** `Role.OSM` is a User role
and is provisioned separately from the relationship. Current provisioning
upserts the role and does not remove roles. There is no current invariant that
removes `Role.OSM` when the last active OSM relationship is suspended.

**Provisional recommendation:** do not remove `Role.OSM` when the last active
`OsmHospitalRelationship` is suspended. Do not add or recreate the role when one
relationship is restored. If a relationship exists without the expected role,
fail closed and treat it as a data-reconciliation issue rather than repairing
the role as a side effect of lifecycle mutation.

### User account

Suspending or restoring one OSM relationship must not change `User.status`,
`authSubject`, password state, or provider identity. A User account suspension
or recovery is a separate lifecycle and security operation.

### HospitalMembership

An OSM relationship lifecycle must not create, suspend, restore, or otherwise
alter a `HospitalMembership`, including when the same User is also Hospital
staff in the same or another Hospital.

## 14. Authorization and capability analysis

### Current implementation

**Direct current implementation evidence:** the current workforce policy allows
routine workforce reads/provisioning and Staff membership operations only for an
authenticated `HOSPITAL` actor with a direct active `OWNER` membership in the
exact active target Hospital. It has no OSM suspend/restore capability.

### Provisional future capability candidates

Keep these capabilities distinct from Staff membership lifecycle names:

```text
osm:suspend
osm:restore
```

**Provisional actor and scope:**

```text
authenticated User
  + Role.HOSPITAL
  + direct active HospitalMembership(OWNER) in exact target Hospital
  + target Hospital.status = ACTIVE
```

The server must additionally re-check:

- the exact relationship ID belongs to the exact target Hospital;
- the target relationship is in the expected source state;
- target `User.status = ACTIVE`;
- target `Role.OSM` exists;
- client-provided Hospital ID is only a selector, never authority;
- parent/child/sibling/network metadata does not widen authority.

Routine authority is not recommended for:

- ordinary Hospital Members;
- OSM actors acting on themselves;
- Patients;
- Platform `ADMIN` acting from the global role alone;
- a Hospital Owner in a different Hospital;
- a parent or child Hospital without a separate approved network capability.

An emergency override, if required, is an **open customer requirement** and
must not be smuggled into the normal `osm:suspend` capability.

## 15. Transaction and concurrency recommendation

This section defines a future boundary only. It does not implement a service,
Server Action, Route Handler, schema change, or UI control.

### 15.1 Suspend under the provisional BLOCK policy

```text
server ActorContext
  → exact direct Owner + target Hospital authorization re-check
  → target User re-check: ACTIVE and Role.OSM
  → target OsmHospitalRelationship re-check: exact Hospital, ACTIVE
  → target Hospital re-check: ACTIVE
  → count current PatientOsmAssignment rows in exact Hospital
  → if count > 0: safe conflict, no writes, no success audit
  → conditional update ACTIVE → SUSPENDED
  → write bounded osm relationship audit event
  → commit
```

The conditional update should include the exact relationship ID, exact Hospital,
expected current status, and expected `updatedAt` supplied by the bounded detail
projection. A stale `updatedAt`, changed source status, missing target, inactive
User, inactive Hospital, or changed Owner scope must return a safe conflict or
deny.

The count must use the existing relationship path:

```text
PatientOsmAssignment.osmUserId
  → PatientOsmAssignment.patientHospitalRelationshipId
  → PatientHospitalRelationship.hospitalId = targetHospitalId
```

The lifecycle mutation and current assignment mutation already have the same
serializable transaction pattern available. Running both under serializable
isolation gives concurrent assignment/suspension requests a conflict boundary;
a bounded retry must re-read the relationship and assignment count. It must not
blindly retry a blocked business conflict.

### 15.2 Restore

```text
server ActorContext
  → exact direct Owner + target Hospital authorization re-check
  → target Hospital re-check: ACTIVE
  → target User re-check: ACTIVE and Role.OSM
  → target OsmHospitalRelationship re-check: SUSPENDED
  → conditional update SUSPENDED → ACTIVE
  → write bounded osm relationship audit event
  → commit
```

Restore does not create, end, update, or reassign a Patient assignment. It does
not restore a User account or add a role. Under the recommended BLOCK policy,
the supported suspend path has already established that no current assignment
remained when the relationship was suspended.

### 15.3 Boundary constraints

- Use the existing Application Service → Policy → Prisma boundary.
- Keep provider/authentication I/O out of this local relationship transaction.
- Do not create a generic workflow engine.
- Do not use a loop that rewrites dependent assignments or relationships.
- Do not treat a successful relationship update as proof that Patient work was resolved.

## 16. Audit recommendation

### 16.1 Successful lifecycle events

**Provisional event candidates, consistent with current repository naming:**

- `osm_relationship.suspended`
- `osm_relationship.restored`

The event must be written through the existing bounded audit service in the same
transaction as the relationship state change. The resource is
`OsmHospitalRelationship`; the actor comes from the server-resolved context.

Safe metadata should remain bounded, for example:

```text
fromStatus
toStatus
```

`activeAssignmentCount` may be useful as bounded conflict/UI data, but it is
not needed in a successful suspension event because a successful BLOCK
suspension has count zero. Patient IDs, Patient names, HN, clinical data, raw
identity, National ID, `authSubject`, provider identifiers, credentials, and
tokens must not be placed in lifecycle audit metadata.

### 16.2 Blocked suspension

**Provisional recommendation:** do not write a success lifecycle event when
suspension is blocked by current assignments. The normal prototype need not
write a denied-attempt audit event until a real audit requirement defines its
retention, actor visibility, failure taxonomy, and abuse implications.

The safe conflict response may contain a bounded assignment count for the
operator. That response is not a Patient assignment mutation and is not a
customer-approved audit contract.

## 17. UX recommendation

### 17.1 Reuse the existing OSM detail surface

The future lifecycle UX should reuse the existing bounded detail route and
projection rather than create a parallel admin module. The current dynamic
route resolves the OSM kind as:

```text
/app/workforce/osm/[relationshipId]
```

The current surface already displays display name, Hospital, User account
status, relationship status, Hospital status, and a read-only OSM message. A
future slice may add only the minimum lifecycle information:

- active current Patient assignment count in the exact Hospital;
- lifecycle action availability;
- an explicit reason when the action is unavailable.

Example future state:

```text
Account:
ACTIVE

OSM relationship:
ACTIVE

Assigned Patients:
8
```

For the provisional BLOCK policy, the explanation may use:

> OSM รายนี้ยังรับผิดชอบผู้ป่วย 8 ราย  
> กรุณาจัดการผู้รับผิดชอบผู้ป่วยก่อนระงับความสัมพันธ์

The wording is a UX proposal, not an implementation change or approved final
copy.

### 17.2 Assignment-resolution navigation

The repository has a per-Patient Owner assignment route and a Hospital Owner
Patient directory. It does not currently have a Hospital Owner route that
lists all current Patients for one selected OSM. The existing
`/app/patients/assigned` route is an OSM assigned-Patient read surface and must
not be reused as an Owner-wide OSM report without a new authorization design.

Therefore the minimum future prototype should display the count and block the
action. A “View assigned Patients” affordance can point to an existing
exact-Hospital Patient workflow only after its navigation and authorization
are confirmed. Do not add bulk reassignment, a bulk unassignment action, or an
assignment-resolution wizard in Phase 11C.

## 18. State matrix

The matrix below distinguishes current state interpretation from the
provisional future mutation rule.

| User.status | OSM relationship | PatientOsmAssignment state in exact Hospital | Hospital.status | `Role.OSM` | Interpretation / future lifecycle result |
| --- | --- | --- | --- | --- | --- |
| `ACTIVE` | `ACTIVE` | 0 current; ended history allowed | `ACTIVE` | Present | Suspend is potentially allowed after exact Owner authorization and stale-state checks. |
| `ACTIVE` | `ACTIVE` | 8 current (`endedAt IS NULL`) | `ACTIVE` | Present | **Provisional BLOCK:** reject suspension; preserve relationship and assignment history. |
| `SUSPENDED` | `ACTIVE` | Any | `ACTIVE` | Present | Lifecycle mutation fails closed; User account recovery is separate. |
| `ACTIVE` | `SUSPENDED` | 0 current; historical ended rows only | `ACTIVE` | Present | Restore is potentially allowed; it does not recreate historical assignments. |
| `ACTIVE` | `SUSPENDED` | Current row exists due to legacy/manual inconsistency | `ACTIVE` | Present | Unsupported inconsistent state; do not silently resolve or reassign during restore. |
| `ACTIVE` | `ACTIVE` | Any | `SUSPENDED` | Present | OSM lifecycle action is unavailable/fails closed because the target Hospital is inactive. |
| `ACTIVE` | `SUSPENDED` in Hospital A; `ACTIVE` in Hospital B | Hospital B assignments unchanged | `ACTIVE` | Present | Hospital B is unaffected; no account, role, or cross-Hospital mutation. |
| `ACTIVE` | `ACTIVE` | Any | `ACTIVE` | Missing | Relationship/role invariant is invalid; fail closed and reconcile rather than add a role implicitly. |
| `ACTIVE` | `PROVISIONED` or `INVITED` | No lifecycle current state | `ACTIVE` | Present | Provisioning/activation workflow state, not a suspend/restore target. |
| `PROVISIONED` | `PROVISIONED` | No supported current assignment | `ACTIVE` | Present | Existing activation boundary applies; relationship lifecycle does not activate the User. |

## 19. Open customer requirements

These remain **open customer requirements**, not answers supplied by Phase 11C:

1. Can an OSM relationship be suspended while current Patient assignments exist?
2. If yes, do those assignments remain current?
3. If assignments remain current, should restoring the relationship automatically restore OSM access to them?
4. If no, must every current assignment be explicitly reassigned or ended first?
5. Is there an emergency override for immediate suspension for security, employment, or safety reasons?
6. Who may perform an emergency override, and what evidence and audit are required?
7. Should a suspended OSM remain visible as the assigned historical/current responsible person?
8. Is `SUSPENDED` sufficient, or is a distinct ended/terminated relationship state eventually required?
9. Can one OSM be associated with multiple Hospitals operationally, not merely technically?
10. What is the source/target approval model for moving an OSM between Hospitals?
11. Should the last OSM relationship affect `Role.OSM`?
12. Who manages `User.status` suspension and recovery separately from relationship lifecycle?
13. What should reports show for Patients whose assigned OSM relationship is unavailable?
14. Should Hospital staff receive warnings when a current assignment depends on an inactive OSM relationship?
15. What retention and historical display policy applies if an OSM relationship is eventually ended or removed?
16. If an emergency suspension is allowed, is it a separate account-level suspension, relationship-level override, or an explicit assignment-resolution operation?

The normal BLOCK recommendation must not be used to silently answer the
emergency question.

## 20. Recommended Phase 11D.0 implementation slice

**Provisional recommendation for later approval; not implemented in Phase 11C.**

### Phase 11D.0 — OSM Relationship Suspend / Restore Working Prototype

Supported scope:

- reuse the bounded OSM detail surface;
- show the exact-Hospital current Patient assignment count;
- add `osm:suspend` and `osm:restore` as separate future capabilities;
- allow only the exact direct active Hospital Owner scope;
- require the target User to be `ACTIVE`;
- require the target Hospital to be `ACTIVE`;
- allow `ACTIVE → SUSPENDED` only when exact-Hospital current assignment count is zero;
- allow `SUSPENDED → ACTIVE` with no assignment recreation;
- keep User account, provider credentials, and `User.status` unchanged;
- keep `Role.OSM` unchanged;
- make no Patient assignment mutation;
- make no Patient or Patient–Hospital relationship mutation;
- make no cross-Hospital mutation;
- use a serializable local transaction;
- use expected-state/`updatedAt` stale-write protection;
- write one bounded success audit event in the same transaction.

Suspension with current assignments is a safe conflict. The prototype must not:

- automatically reassign Patients;
- automatically end or unassign assignments;
- automatically choose a replacement OSM;
- automatically restore historical assignments;
- delete the relationship;
- transfer the OSM or Patients;
- add a new relationship state;
- add geography or Hospital hierarchy authority.

### Future acceptance checks

Before implementation approval, the next phase should demonstrate:

- direct active Owner allow and Member, OSM, Patient, Admin-only, wrong-Hospital, and hierarchy-only deny paths;
- exact relationship/Hospital scope isolation;
- active assignment count resolved through `PatientHospitalRelationship.hospitalId`;
- blocked suspension leaves relationship, assignments, and success-audit count unchanged;
- zero-assignment suspension changes only the target relationship and writes one bounded event;
- restore requires an active User and does not change User, role, or assignment rows;
- stale expected-state and concurrent assignment/lifecycle conflicts fail safely;
- multi-Hospital relationship B remains unchanged when relationship A changes;
- no automatic assignment mutation and no hidden Patient identifiers in lifecycle audit metadata.

This slice is a provisional prototype for requirement validation, not customer
approval and not a commitment to the permanent emergency or termination model.

## 21. Explicit non-goals

Phase 11C does not implement or authorize:

- `osm:suspend` or `osm:restore`;
- an OSM lifecycle Application Service;
- OSM lifecycle Server Actions or Route Handlers;
- lifecycle buttons or controls;
- Prisma schema changes or migrations;
- a new relationship state;
- Patient automatic reassignment, auto-unassignment, or bulk assignment mutation;
- an assignment-resolution wizard or workflow engine;
- OSM transfer/move;
- OSM delete or hard delete;
- User account suspension or recovery;
- role removal or role recreation;
- Hospital suspension or restoration;
- Owner governance, ownership transfer, or hierarchy authorization;
- Area, Zone, Province, District, Subdistrict, Village, geographic catchment, or geographic OSM authorization;
- dashboards, reports, statistics, notifications, or emergency override behavior;
- ThaID, LIFF, mobile/native transport, generic IAM, generic RBAC, or generic ACL;
- any product-code, test-code, or generated-code implementation.

Phase 11C ends here. Phase 11D.0 must not begin until explicitly approved.
