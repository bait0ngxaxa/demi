# ADR-0032: Ending care is reversible only by a platform ADMIN

- Status: Accepted (engineering default taken in the operational-gaps task, 2026-11-11; open to Product Owner review in the PR)
- Date: 2026-11-11
- Amends: Phase F (ก-18) "ending is terminal" for `PatientHospitalRelationship` (migrations `20261023100000`, `20261024100000`).
- Does not change: who may end care (the persisted OWNER of the exact ACTIVE Hospital), what ending does, the end form's warning, the `ENDED_RELATIONSHIP` answer and message of provisioning/import, the 30-day self-registration window, Role + Capability + Scope authorization.

## Context

`endPatientHospitalRelationship` ends a Patient's care with one Hospital and a database trigger kept the end immutable. `PatientHospitalRelationship` is unique on `(patientProfileId, hospitalId)`, so adding the same national ID again answers `ENDED_RELATIONSHIP` and tells the Hospital to contact the DEMI administrator. No code path could clear the end, and the trigger refused even a direct SQL update. A mistaken end, or a Patient who returns, therefore had no supported recovery.

## Decision

1. **One relationship row per Patient and Hospital is kept.** A platform ADMIN reopens the existing row instead of creating a second one.
2. **Only a platform ADMIN reopens.** `reopenPatientHospitalRelationship` requires the ADMIN role in the actor context and in the database (ACTIVE User with `Role.ADMIN`). Hospital OWNERs, MEMBERs and อสม. are refused; an OWNER still cannot undo an end.
3. **Input and answers.** The ADMIN gives the Hospital, the Patient's national ID (resolved by the existing identity hash) and a non-blank reason, after a confirmation step that shows the masked name and end time. An unknown person, a relationship with another Hospital only and a relationship that is not ended answer the same not-found result. A Hospital that is not ACTIVE is refused.
4. **One serializable transaction.** It writes a row to the new append-only `PatientHospitalRelationshipReopening` (previous `endedAt`, `endedByUserId`, `endReason`; `reopenedAt`, `reopenedByUserId`, `reopenReason`), clears the three end fields together (as `PatientHospitalRelationship_end_check` requires), guarded by the exact end the ADMIN confirmed, and records `patient.hospital_relationship.reopened` with ids and timestamps only. Free-text reasons never go into audit metadata, as for the end.
5. **The database still guards the end.** The end trigger now allows exactly one transition on an ended row: all three end fields cleared, Patient and Hospital unchanged, and a history row preserving exactly this end already present. Any other change, including a direct update without the history row, is still refused. The history table refuses UPDATE and DELETE (except the disposable demo/test reset) and blocks hard deletion of the relationship and the users it names.
6. **Reopening restores nothing else.** The อสม. assignment, cancelled appointments, rejected service requests and revoked activations stay as they are; an ACTIVE Program continues. A Patient without an active account can still self-register only while the unchanged self-registration rule admits the relationship (its 30-day window counts from the relationship's `createdAt`, not from the reopen); otherwise the Hospital issues an activation link. The reopen result tells the admin which applies (`ACTIVE`, `SELF_REGISTRATION_OPEN` or `ACTIVATION_LINK_REQUIRED`).

## Why the single-row model was kept

- `(patientProfileId, hospitalId)` uniqueness is the anchor of Hospital scope, provisioning/import identity checks and many foreign keys (appointments, programs, rounds, evidence, reporting). A second row per episode would change all of them and every query that assumes one relationship per Patient and Hospital.
- All clinical and operational history already stays attached to the one relationship, so continuing on the same row keeps one longitudinal record; the reopening table makes each end/reopen cycle retrievable without duplicating that record.
- The change is small, reversible in policy and keeps the database-level immutability of an end, apart from one auditable transition.

## Consequences

- Platform ADMINs get a section on `/app/admin/hospitals/[hospitalId]` (ACTIVE Hospitals only).
- The user-record deletion registry treats reopening history as data: a reopened relationship is not hard-deletable.
- Episodes are reconstructed from the reopening history plus the current end fields; there is no per-episode relationship id.
