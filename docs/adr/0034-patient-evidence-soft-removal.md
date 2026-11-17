# ADR-0034: Patient evidence photos can be removed (soft removal with storage deletion)

- Status: Accepted (engineering default taken for finding N4, 2026-11-17; open to Product Owner review in the PR)
- Date: 2026-11-17
- Amends: [Phase 10D.0 Patient Evidence](../phases/PHASE_10D0_PATIENT_STATUS_ARTIFACTS_WORKING_PROTOTYPE.md), where a `PatientEvidenceArtifact` could only be created.
- Does not change: who may upload or view evidence, the upload pipeline, the short-lived signed URL, ADR-0016 network read (read-only), Service 1 association rules.

## Context

`PatientEvidenceArtifact` had no removal state and the evidence service could only create. A photo uploaded to the wrong Patient stayed on that Patient's record for good, visible to every reader of the relationship.

## Decision

### Soft removal

`PatientEvidenceArtifact` gains `removedAt`, `removedByUserId` (FK to `User`, `onDelete: Restrict`) and `removalReason` (up to 500 characters). The CHECK `PatientEvidenceArtifact_removal_check` allows either all three NULL, or `removedAt` and `removedByUserId` both set, written NULL-safe with `COALESCE((...), FALSE)`. The service always stores a trimmed reason of 1-500 characters.

The row is never hard-deleted: it keeps who uploaded it, who removed it, when and why. `removePatientEvidenceArtifact` marks it in a serializable transaction with a guarded `updateMany` on `removedAt: null` (a second removal answers `ConflictError`) and writes the audit event `patient_evidence_artifact.removed` with the artifact, relationship and Hospital ids. The reason stays on the row and is not copied into audit metadata.

Every read path excludes removed rows: the evidence list, the content route (a removed photo answers 404 like an unknown one) and Service 1 association (a removed photo cannot be attached). There is no restore.

### Storage deletion and the leftover object

After the transaction commits, the service deletes the storage object. If that deletion fails, it logs `storage_removal_failed` with the opaque artifact id through `logOperationalError` and still answers success, because the row is already hidden and no read path can reach the object.

That leaves an object in the private bucket with no visible row. It is reachable only through storage administration, and the row still records its key (`storageObjectKey`) and removal. No background job sweeps these objects; an operator who sees `storage_removal_failed` can delete the object by key. If the removal transaction's outcome is unknown to the client (for example a connection lost at commit), the service does not delete the object either; the row may be removed with its object left behind, which is the same leftover case.

### Who may remove (engineering default)

The actor must pass the same access check as upload for the relationship (`resolvePatientEvidenceAccessContext` with `patient-artifact:create`: ACTIVE direct OWNER/MEMBER of the Hospital, or the currently assigned อสม.; never through ADR-0016 network read). On top of that the actor must be the uploader, or an ACTIVE direct OWNER/MEMBER of that Hospital. An อสม. can therefore remove only their own uploads, and only while assigned.

An unknown artifact, an artifact of another relationship and every actor outside the relationship's upload scope answer `NotFoundError`, like the read path. An actor inside the scope who fails the uploader/Hospital rule answers `ForbiddenError`. An ended care relationship is outside the upload scope, so its photos cannot be removed (`NotFoundError`).

### Service 1 photos are not removable

`PatientProgramServiceOneArtifactAssociation` links a photo to a Service 1 activity (ตารางชีวิตของฉัน, กราฟชีวิต, ความฝันของฉัน, the signed แผน "สุขภาพดี" page). The association is read by round completeness (`routineIsComplete`: a dated routine with no rows is done when it has a photo), the Service 1 workspace, the Goal Plan view and the program report.

Deleting the association on removal would change Service 1 rules: an activity photo cannot be replaced (`กิจกรรมนี้มีหลักฐานรูปแล้วและไม่สามารถเปลี่ยนแทนในรอบนี้ได้`), and a completed round is read-only, so removal could silently turn a completed round's routine back to not done. Removal of an associated photo is therefore blocked with `ConflictError` (`รูปนี้แนบเป็นหลักฐานของกิจกรรม Service 1 แล้ว จึงลบจากหน้านี้ไม่ได้`), and the evidence page shows that note in place of the remove action. Because associated photos are never removed, the Service 1, Goal Plan and report reads need no removal filter. The check and the association write both run in serializable transactions, so a concurrent attach and remove cannot both commit.

### UI

The evidence item shows `ลบรูป` only when the page context allows it (display only; the server re-checks). It opens the shared confirm dialog `ลบรูปหลักฐานนี้?` with a required `เหตุผลที่ลบ`. Success refreshes the list in place with `router.refresh()`. An unconfirmed outcome shows `UnknownOutcomeAlert` (`reload`): reloading shows whether the photo is gone, and a repeat removal answers a conflict, never a second removal.

## Consequences

- A wrong-patient photo can be taken off the record by its uploader or the Hospital's staff, with a stored reason and an audit event.
- A user who uploaded and removed a photo keeps that history: `User.patientEvidenceArtifactsRemoved` is an EMPTY relation for user record deletion, like `patientEvidenceArtifactsCreated`.
- A photo attached to Service 1 stays until Service 1 gains a replace or detach rule; that is a separate decision.
- A failed storage deletion leaves an unreachable object until an operator removes it.
