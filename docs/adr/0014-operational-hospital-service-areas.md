# ADR-0014: Operational Hospital Service Area Ownership

- Status: Accepted for Phase A foundation; eligibility-source onboarding, editable fields and transfer approval remain open
- Date: 2026-10-20
- Supersedes: ADR-0013 H1 only insofar as it prohibits Parent OWNER operational attach/end and equates all operational areas with canonical links. H2–H5 are unchanged.

## Context and approved requirement

The Product Owner now requires an active direct Parent Hospital OWNER to manage an operational network of existing verified Child facilities, retain relationship history, and eventually select a Child for separately authorized Patient reads. Patient reads are Phase B, management UI and approved reporting integration are Phase C. Neither is authorized by this foundation.

ADR-0013 correctly rejected OWNER writes to official Hospital identity and `parentHospitalId`. Its historical choice of canonical hierarchy as the only area relationship cannot support self-managed operational associations. Preserve its reasoning; separate the two responsibilities instead of changing official identity ownership.

## Decision

`HospitalServiceArea` represents an operational association. `endedAt IS NULL` means ACTIVE, otherwise ENDED. Each attach inserts a new UUID row with database creation timestamp and initiating OWNER. End requires explicit confirmation and a nonempty reason; it sets database time and terminating OWNER, retains the row, and never deletes dependent data. Reattachment to the same Parent creates another row. There are no approved editable operational fields, so no update service is exposed. Parent/Child identity and creation attribution are immutable; ended rows are terminal and immutable. Creation time is the time this new association is recorded, not an inferred historical effective date.

PostgreSQL enforces one active assignment per Child through a partial unique index, distinct Parent/Child identities, consistent end metadata, restrictive foreign keys and a history trigger. Services revalidate persisted User/person/role, active direct OWNER membership and active Parent inside a Serializable transaction with the mutation and required audit. Concurrent conflicts return the existing `ConflictError`; no automatic replay is performed. Duplicate attach and repeat end are conflicts, never false success. An unknown/foreign area is indistinguishable through the exact-Parent end path.

Capabilities are `hospital-network:area:read` and `hospital-network:area:manage`. They use the established OWNER policy as a preliminary context check and persisted authority as the final check. ADMIN-only, MEMBER, OSM-only, PATIENT-only and unrelated/Child-only OWNER actors are denied. A multi-role ADMIN/HOSPITAL actor must independently qualify as the exact Parent OWNER. There is no ADMIN management bypass and no new generic RBAC layer.

## Eligibility contract and conservative boundary

The current approved Master has 43 main and 35 subordinate records. Its only structural discriminator is `parentCanonicalCode`; subordinate examples include PCC, PCU and รพ.สต. There is no authoritative facility-type/operational-eligibility classification. Neither names, code patterns nor `parentHospitalId` alone prove eligibility.

`HospitalServiceAreaEligibility` is the explicit trusted-source contract: exact existing Hospital ID, kind PARENT/CHILD, nonempty `sourceReference` and `verifiedAt`. Missing attestation fails closed. This is not a Hospital verification override: both facilities must still be ACTIVE. No OWNER, onboarding, application action or seed can write attestations. The migration creates no attestations. A reviewed authoritative classification source and controlled maintenance/import procedure must be approved before populating production attestations; test attestations are synthetic only. Attestation storage is not evidence that the source decision has been resolved.

Until transfer rules are approved, candidates must also have canonical placement under the selected Parent, a root Parent and a leaf Child. This restriction narrows eligibility; it does not redefine the canonical hierarchy as the operational association. An active association under another Parent is a conflict; any previous association with another Parent blocks self-service attachment even after canonical reparenting. The currently owning Parent can end its association even if the Child has become inactive or canonical placement changed. Parent authority itself must remain valid. No in-place reassignment or consent/approval workflow is invented.

## Adoption and official Master coexistence

No migration backfill, automatic application-request bootstrap or canonical-link rewrite is allowed. The offline `reportHospitalServiceAreaAdoption(database)` primitive is repeatable, read-only and classifies canonical pairs as ready, active, ended requiring explicit reattachment, or blocked. It has no apply mode and is not a public/server-action entry point.

After authoritative eligibility is populated through reviewed governance, use the report to review exact ready pairs. A currently authorized OWNER may explicitly attach each ready pair as a **new** operational association. Rerunning the report reports ALREADY_ACTIVE; uniqueness prevents duplicates. Ended rows are never auto-restored. Existing historical attachment dates are unknown and are not imported. Bulk system-owned historical bootstrap is deferred; any future importer must have explicit system provenance with no human OWNER attribution, reviewed dry-run/apply semantics and its own audit contract. It must not call the OWNER service while impersonating a human.

Canonical Children without operational assignments remain canonical Children: onboarding, existing nine-value Parent summaries/exports and direct work contexts behave exactly as before. Operational resolution fails closed until an explicit assignment exists. Master reconciliation continues to modify only canonical Hospital identity/links; it neither overwrites nor creates operational assignments. A placement/classification mismatch invalidates operational resolution, retains history, and requires reconciliation of the business intent rather than automatic repair.

## Security boundary and consequences

Operational association is **not** `HospitalMembership`, workforce membership, a Patient relationship, an OSM assignment, an export grant or a notification recipient. No existing Patient, clinical, provisioning, workforce, report, Program, Follow-up, appointment, work-area selector or LINE predicate consumes the new table. Ending an operational association therefore does not revoke the separate canonical-report authority; H5 still evaluates the current canonical link. UI must explain this distinction when introduced in Phase C.

Audit uses `hospital_service_area.attached` / `.ended`, actor, relationship ID, Parent/Child IDs, from/to lifecycle and database event timestamp. End reason stays on the restricted relationship row, not in general audit metadata. Audit failure rolls back the state transition. No patient content is logged.

The cost is an explicit source-classification prerequisite and deliberately unavailable cross-Parent transfer/edit operations. This is preferable to widening organization/data access from unproven identity or inventing approval rules.

## Open requirements and handoff

Approve the authoritative facility classification source and its ingestion/revocation process; approved operational edit fields; cross-Parent transfer approval; Patient read fields/purpose/privacy/record-time rules; Phase C management UX and any reporting source switch. H2–H5 and all existing real-data disclosure conditions remain separate.

Exact services, rollout and integration map: [Phase A handoff](../phases/PHASE_A_HOSPITAL_SERVICE_AREAS.md). This decision does not mark the full responsibility-area or Patient-access flow complete.
