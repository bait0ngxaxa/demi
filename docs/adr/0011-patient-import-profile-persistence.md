# ADR-0011: Patient Import Profile Persistence and Hospital Ownership

> **Current decision — 2026-10-21:** [ADR-0019](0019-owner-administration-and-import-only-roster.md) supersedes MEMBER/OSM Hospital administration, ADR-0008 2026-10-14 D1 OSM provisioning/read, delegated MEMBER report export and manual patient registration. ACTIVE direct OWNER administers the exact ACTIVE Hospital and imports strict Excel v2 (including one row). *(Template note, 2026-10-21: the current strict template is v3 with medical/family history — see [Patient Import v3](../phases/PATIENT_IMPORT_V3_COMPLETE_INITIAL_HEALTH_DATA.md).)* MEMBER/OSM retain resource-scoped care; personal self-service and separately authorized Platform ADMIN recovery remain. Earlier decisions below are historical where inconsistent.

- Status: Accepted
- Date: 2026-10-13
- Authority: Product Owner instruction, Patient Profile Persistence & Import-to-Detail Reconciliation

The owner now approves persistence of every meaningful field in the strict hospital-specific Template v2. This closes the profile-persistence gate for this scope. Earlier Phase 10 and Phase 16 documents describe decisions at their historical dates; this decision does not rewrite them or approve unrelated clinical capabilities.

## Decision

- Identity and names remain owned by identity/Person; HN belongs to PatientHospitalRelationship.
- Date of birth belongs to the global PatientProfile and retains PostgreSQL date-only semantics. A populated conflicting global date is CONFLICT, including across hospitals. A new hospital relationship may fill an absent global date; duplicate imports never fill or overwrite existing records.
- Demographics, contact, the nine distinct address components and emergency-contact relationship belong to PatientHospitalProfile for the exact hospital relationship. Occupation and education are not import fields.
- A hospital-local profile is authoritative as a whole, including nulls. Legacy fallback applies only when the local row is absent. Never borrow a profile from another hospital.
- Structured address components are canonical after import; addressText is null. Both detail and self-profile derive the readable Thai address from those components. A submitted unchanged readable address preserves all components. An explicit changed/cleared address replaces them atomically with addressText and clears the former components. A database CHECK prevents two active representations. Other edits preserve imported fields and keep existing version checks and ownership authorization. New fields are read-only in self-profile; edit permissions are not expanded.
- Classification and initial baseline use their established domains and transaction services. The existing effective-date and classification creation rules continue to apply.
- Import provisions only new hospital relationships. Duplicate imports retain ALREADY_EXISTS/CONFLICT and never overwrite established hospital profiles. All row writes and successful audits share the existing Serializable transaction and retry boundary. Audits contain identifiers/outcomes, not profile payloads.
- Source sequence is import metadata, retained for parsing/source-row traceability rather than patient storage.
- Only strict Template v2 is supported. HMAC binding, confirmation re-parsing, hospital authorization, failed-row re-import, 500-row and 5 MB limits remain required. OSM assignment is separate.
- Disposable development/test data may be reset and re-imported after positively identifying the target. No historical backfill, old-template compatibility, production repair or existing-patient overwrite workflow is required. Shared and production databases must not be reset.

## Trade-offs

Keeping address components only as a concatenated text would lose field meaning; keeping both text and components independently would allow stale displays. Mutually exclusive structured/free-text representations preserve the source fields while supporting the existing text editor. addressText capacity becomes 2,000 characters to accommodate the derived nine-component address without rejecting unchanged form submissions; existing demographic/contact bounds remain.

## References

- [ADR-0004](./0004-patient-provisioning-and-activation.md)
- [ADR-0006](./0006-transactional-business-operations.md)
- [Field mapping and implementation handoff](../phases/PATIENT_IMPORT_PROFILE_PERSISTENCE_HANDOFF.md)
