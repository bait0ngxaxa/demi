# ADR-0027: Appointment assignees

- Status: Accepted (Product Owner, 2026-11-03; Canva "ชื่อผู้นัดหมาย (แพทย์/พยาบาล/อสม.)", "เลือกแพทย์ พยาบาล อสม.")
- Date: 2026-11-03
- Amends: [ADR-0023](./0023-service-request-appointments.md) "Visiting อสม. access" — a one-off visit no longer needs a service request. Supersedes the AF-3 rules that a staff assignee is a DOCTOR or NURSE and that an อสม. assignee is the patient's current อสม. on a HOME_VISIT.
- Builds on: [ADR-0026](./0026-member-operational-parity.md) (who operates a Hospital).

## Context

An appointment could be given to a doctor or nurse of the Hospital, or to the patient's current อสม. for a home visit. The customer whiteboard names whoever made the appointment ("ผู้นัดหมาย") and lets staff choose a doctor, a nurse or an อสม. Hospitals also have coordinators and staff without a recorded profession who run appointments, and they send an อสม. who does not care for the patient (a neighbour village, a stand-in) to a home visit or a clinic. ADR-0023 already gave such an อสม. a narrow, appointment-only scope, but only when the visit came from a patient's service request.

## Decision

- **AP-1 — Staff assignee.** `responsibleUserId` is any operator of the appointment's Hospital: an ACTIVE OWNER or MEMBER with an ACTIVE User of an ACTIVE Hospital (`hospitalOperatorMembershipWhere`; the picker and the work-list filter use `hospitalOperatorRosterWhere`), whatever the profession (DOCTOR, NURSE, COORDINATOR, OTHER or none). An edit that keeps the same staff assignee does not re-check them.
- **AP-2 — อสม. assignee.** `assignedOsmUserId` is any ACTIVE อสม. with an ACTIVE `OsmHospitalRelationship` to the appointment's ACTIVE Hospital. When they are not the patient's current อสม. the appointment is a one-off visit (`isOneOffVisitOsm`: appointment อสม. ≠ patient's current อสม., from either source) and they get the ADR-0023 one-off scope for that appointment only: read, acknowledge on the patient's behalf, accept, ask to reschedule and record coordination (`VISIT_OSM_APPOINTMENT_CAPABILITIES`), while it is SCHEDULED and no later than 24 hours after its time. Reassigning the appointment ends the scope at once. They gain nothing else (no patient directory, Program, screening or follow-up access; SR-B2 is still open). The patient's assignment never changes. `osmAssignmentIdAtCreation` keeps recording the patient's caring assignment when the appointment is made ("อสม. ที่ดูแลขณะสร้างนัด"), whoever the assignee is.
- **AP-3 — Any location.** An อสม.-assigned appointment may use any location type. What an อสม. may do on their own is unchanged: they create only HOME_VISIT appointments for their own current patient, assigned to themselves, and edit or cancel only the HOME_VISIT appointments of their current patient that are assigned to them; editing one cannot hand it to another อสม.
- **AP-4 — One assignee.** An appointment has a staff assignee or an อสม. assignee, never both (service check and `PatientAppointment_single_assignee_check`). The former `PatientAppointment_assigned_osm_home_visit_check` is dropped.
- **AP-5 — ผู้นัดหมาย.** Every appointment view shows the creator's name and role at the appointment's Hospital (แพทย์ / พยาบาล / เจ้าหน้าที่ from their membership profession, อสม. from their อสม. relationship), next to the assignee with their role. The Patient's own projection already names staff and อสม., so it names the appointer too; the caregiver projections are versioned grant contracts (AF-5, SR-C1) and are not widened by this ADR.

### Notifications

`OSM_APPOINTMENT_ASSIGNED` for a one-off อสม. goes to that อสม. only, as for a service-request visit, and is sent while they are still the appointment's อสม. and an ACTIVE อสม. of the Hospital. When the patient's อสม. assignment changes, every future SCHEDULED appointment of the previous อสม. moves to the new one (the HOME_VISIT filter only mirrored the dropped CHECK).

### Work list

The อสม. acceptance queue and the WAITING state cover every appointment assigned to the อสม. (current or one-off) at any location; the one-off อสม. sees the appointment in their work list until the scope ends.

## Consequences

- Staff with any profession appear in the assignee picker, grouped "เจ้าหน้าที่" (name · profession) and "อสม." (the patient's current อสม. first as "อสม. ผู้ดูแล", then the Hospital's other ACTIVE อสม., with a name search when the list is long).
- Appointments made before this ADR are unchanged; none named both assignees (checked by the migration).
- An appointment whose อสม. is no longer the patient's current one is read as a one-off visit for that อสม.

## Open questions

- Whether the caregiver appointment contract should add "ผู้นัดหมาย" in a new contract version.
- SR-B2: whether a one-off อสม. may read or record the care items of the visit.
