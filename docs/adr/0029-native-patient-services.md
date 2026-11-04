# ADR-0029: Native patient services

- Status: Accepted (Product Owner, 2026-11-04)
- Date: 2026-11-04
- Supersedes: [ADR-0023](./0023-service-request-appointments.md) SR-D5 ("Offered by default; staff can switch a service off") and the `HospitalServiceOffering` part of ADR-0023 "Data model (SR-A)".
- Keeps: every other ADR-0023 rule — confirm creates the appointment (SR-D1), rejection with a reason, the one-off visit อสม. (SR-D2, SR-D3, as amended by [ADR-0027](./0027-appointment-assignees.md)), the service on the appointment and its type (SR-D4), the preferred date, slot and note (SR-D6), the `OSM_SERVICE_REQUESTED` notification and patients-only requests (SR-D7).

## Context

The three home-visit services a patient may request — คัดกรอง (`SCREENING`), ติดตาม (`FOLLOW_UP`) and เสริมพลังใจ (`EMPOWERMENT`) — are part of the DEMI programme itself, not something a Hospital opts into. SR-D5 nevertheless kept a per-Hospital catalog table, `HospitalServiceOffering (hospitalId, code, enabled)`, whose only purpose was an OWNER switch to turn a service off. The table was seeded by every Hospital creation path, gated request creation (`enabled`), drove a patient state "ขณะนี้โรงพยาบาลยังไม่ได้เปิดบริการสำหรับยื่นคำขอ", and, because its rows referenced their creator with `onDelete: Restrict`, it made any user who created a Hospital impossible to hard-delete.

Hiding the switch alone would leave a table with no behaviour, a gate still reachable by SQL, and the user-deletion blocker. There is no production data.

## Decision

- **The services are native.** All three services are requestable at every ACTIVE Hospital. No Hospital-side setting, toggle, route, action, capability or service enables or disables them. The service list is the `PatientServiceCode` enum with `PATIENT_SERVICE_CODES` (display order) and `PATIENT_SERVICE_LABELS` in `patient-service-definitions.ts`.
- **A request stores its service.** `PatientServiceRequest.serviceCode PatientServiceCode NOT NULL` replaces `offeringId`. `HospitalServiceOffering` is dropped, with its seeding on Hospital creation, the `/app/patients/service-catalog` route, the settings panel, `setHospitalServiceOffering(Action)`, `listManagedHospitalServiceCatalog`, the mutation schema and the `patient-service-catalog:manage` capability.
- **When a request is allowed.** A patient may request a service when the Hospital is ACTIVE, the relationship belongs to the actor's person and has not ended, the actor is an ACTIVE `PATIENT` user, the preferred date and slot are valid (SR-D6), and the relationship has no open (PENDING or APPROVED) request for the same service.
- **One open request per service** is enforced by the partial unique index `PatientServiceRequest_one_unresolved_key ON ("patientHospitalRelationshipId", "serviceCode") WHERE "status" IN ('PENDING', 'APPROVED')`. The service checks first for a clear message; a unique violation from a concurrent request maps to the same `DUPLICATE_OPEN_SERVICE_REQUEST_MESSAGE` conflict.

### Migration

`20261205100000_native_patient_services` adds `serviceCode`, backfills it from each request's offering, fails with the count (SQLSTATE 23514) if a request has none or if two open requests would share a relationship and service, sets it NOT NULL, replaces the partial unique index (created as `_v2`, the old one dropped, then renamed to the original name), drops the composite foreign key, the `offeringId` index and column, and drops `HospitalServiceOffering`. Historical `HOSPITAL_SERVICE_OFFERING_CHANGED` audit events stay as they are; `AuditEvent.resourceId` has no foreign key.

## Consequences

- A patient of a newly created Hospital (single registration, bulk registration or a Child facility) can request every service as soon as the Hospital is ACTIVE; creating a Hospital writes no service rows.
- "ตั้งค่าโรงพยาบาล" holds the contact and patient self-registration settings only. An active direct OWNER still reaches it through self-registration, which has the same audience the catalog switch had.
- Creating a Hospital no longer ties its creator to undeletable service rows; user record deletion no longer checks service offerings.
- Bringing back a per-Hospital service setting would need a new Product Owner decision and ADR.
