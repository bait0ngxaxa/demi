# ADR-0023: Service requests become appointment requests

- Status: Accepted — Product Owner decisions SR-D1..SR-D7, 2026-10-30
- Supersedes: the approve-then-book lifecycle of patient service requests (APPROVE with a permanent อสม. reassignment, then a separate "สร้างนัดหมายจากคำขอนี้"), effective when SR-B ships.
- Related: [ADR-0006](0006-transactional-business-operations.md), [ADR-0016](0016-network-patient-read.md), [ADR-0021](0021-caregiver-accounts-by-invitation.md)

## Context

"การขอรับบริการ" was a request for a service with an optional preferred อสม. Staff approved it by picking an อสม., which permanently reassigned the patient (`assignOsmToPatientInTransaction`), because an appointment may only target the patient's current assigned อสม.; staff then created an appointment from the approved request, which moved it to STARTED. The request carried no date, slot or note, the appointment lost the requested service (only `type`), and a new Hospital offered no service because offerings defaulted to disabled and missing rows read as disabled.

The Product Owner confirmed on 2026-10-30 that a service request is the patient asking for an อสม. home visit for one service, and that the hospital confirms it as an appointment.

## Decision

### Product decisions

- **SR-D1 — Confirm creates the appointment.** The hospital confirms a request ("ยืนยันนัด"), which creates the appointment in the same transaction; the อสม. then accepts or asks to reschedule through the existing appointment flow. Rejecting a request needs a reason, shown to the patient.
- **SR-D2 — One-off visit.** Choosing an อสม. other than the patient's assigned อสม. is a one-off visit: a request or its confirmation never changes the patient's `PatientOsmAssignment`.
- **SR-D3 — Choosing the อสม.** The patient chooses from the ACTIVE อสม. of the patient's own Hospital, with the assigned อสม. listed first and preselected, or "ไม่ระบุ — ให้โรงพยาบาลจัดให้". There is no area model finer than the Hospital/รพ.สต. (`OsmHospitalRelationship` has no area or village), so "อสม. ในพื้นที่" means the อสม. of that Hospital.
- **SR-D4 — Service on the appointment.** The requested service is stored on the appointment and the appointment type is derived from it: SCREENING → ASSESSMENT, FOLLOW_UP → FOLLOW_UP, EMPOWERMENT → EDUCATION (`SERVICE_APPOINTMENT_TYPE`). Hospital-initiated appointments may set the service too (optional).
- **SR-D5 — Offered by default.** Every Hospital offers all three services by default; staff can switch a service off.
- **SR-D6 — Preferred date and slot.** The patient states a preferred date, from tomorrow to 60 days ahead on the Asia/Bangkok calendar (`isValidPreferredDate`), and a slot เช้า / บ่าย / ตามสะดวก, plus an optional note (≤ 500 characters); no exact time. Staff set the exact time on confirmation.
- **SR-D7 — Patients only.** Caregivers do not request on the patient's behalf in this release.

### Two appointment sources

An appointment comes either from the hospital booking the patient (unchanged; `sourceServiceRequestId` null, service optional) or from a patient request the hospital confirms (`sourceServiceRequestId` set, service required).

### Request lifecycle

```text
PENDING ──ยืนยันนัด (appointment created)──▶ STARTED  "ยืนยันนัดแล้ว"
PENDING ──ไม่อนุมัติ (reason required)──────▶ REJECTED
PENDING ──patient withdraws───────────────▶ WITHDRAWN
APPROVED (legacy) ──book──────────────────▶ STARTED
```

The enum values are kept. STARTED now means the appointment is booked. APPROVED is legacy: no new writes after SR-B; existing APPROVED rows stay readable and can still be booked.

### Visiting อสม. access (open, decided before SR-B)

Today an อสม. reads and records only for patients currently assigned to them. A one-off visit needs the visiting อสม. to see the patient without being assigned. SR-B defines that access; its window and scope are an open decision for the Product Owner. Proposed default:

- Window: from confirmation until the appointment is completed, cancelled or no-show, or 24 hours after `scheduledAt`, whichever comes first.
- Scope: read the patient's identity, contact and address and the appointment; record only the items of the requested service.

`isOneOffVisitOsm` (the appointment's อสม. is set, differs from the current assignment, and the appointment comes from a request) identifies these appointments; SR-A does not use it for access.

### Data model (SR-A)

- `PatientServiceRequest` gains `preferredDate DATE`, `preferredSlot PatientServiceRequestSlot { MORNING AFTERNOON ANY }`, `note VARCHAR(500)` and `rejectionReason VARCHAR(500)`, all nullable for legacy rows. CHECKs: date and slot both null or both set; `note` trimmed and non-blank when present; `rejectionReason` trimmed, non-blank and only on REJECTED rows. The service requires a reason for every rejection from SR-B on; requests rejected before this ADR have none.
- `PatientAppointment.serviceCode PatientServiceCode NULL`, backfilled from the source request's offering. CHECK `sourceServiceRequestId IS NULL OR serviceCode IS NOT NULL`. No index is added until a query needs one.
- `HospitalServiceOffering.enabled` defaults to true. The migration inserts every missing (Hospital, service) row enabled and keeps existing rows unchanged. A Hospital that predates this ADR may have no ACTIVE OWNER yet (an ADMIN-registered Parent awaiting onboarding, a Child whose OWNER has not activated), so its rows are attributed to the earliest ACTIVE OWNER, otherwise to the user who registered it (`registeredByUserId`); a Hospital with neither makes the migration fail with the count. Every Hospital creation path (`createHospital`, bulk registration, `createChildFacility`) creates the three rows enabled in the same transaction, with the creator as actor; the creation is the audited event.

### Phasing

- **SR-A:** this ADR, the migration, domain definitions (`SERVICE_APPOINTMENT_TYPE`, service and slot labels, `isValidPreferredDate`, `isOneOffVisitOsm`) and the create schema accepting `preferredDate`, `preferredSlot` and `note` (optional, not yet stored). The only behaviour changes are the enabled defaults and new Hospitals' offerings; booking from a request stores the service. No authorization, UI flow or notification change.
- **SR-B:** services: create with preferences, confirm (appointment in the same transaction, no reassignment), reject with a reason, visiting อสม. access.
- **SR-C:** patient and staff UI and notifications.

## Consequences

- A newly registered Hospital accepts every service request type immediately once it is ACTIVE; staff who do not offer a service must switch it off.
- The EMPOWERMENT label becomes "เสริมพลังใจ" everywhere, read from one domain definition.
- Writers that create appointments from a request outside the services (tests, scripts) must set `serviceCode`.

## Open questions

- The visiting อสม. access window and scope above, to be confirmed before SR-B.
