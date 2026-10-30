import { describe, expect, it } from "vitest";
import { workAppointmentQueryInternals } from "./work-appointment-query-service";

const now = new Date("2026-11-01T03:00:00Z");
const record: Parameters<typeof workAppointmentQueryInternals.toWorkAppointmentItem>[0] = {
  id: "appointment", patientHospitalRelationshipId: "relationship", assignedOsmUserId: "visiting",
  sourceServiceRequestId: "request", serviceCode: "EMPOWERMENT", updatedAt: now, scheduledAt: now,
  durationMinutes: null, type: "EDUCATION", locationType: "HOME_VISIT", status: "SCHEDULED",
  responsibleUserId: null, responsibleUser: null, osmAssignmentAtCreation: null,
  patientHospitalRelationship: { hospital: { name: "โรงพยาบาล" }, patientProfile: { person: { givenName: "ผู้ป่วย", familyName: null } }, osmAssignments: [{ osmUserId: "current" }] },
  rescheduleRequests: [], cancellationRequests: [], assigneeAcceptances: [],
};

describe("SR-C work projection", () => {
  it.each([
    [true, false, "staff", true],
    [false, true, "visiting", true],
    [false, true, "current", false],
    [true, false, "network-staff", true],
    [false, false, "other", false],
  ])("shows one-off only to Hospital staff or visiting OSM (%s/%s/%s)", (hospitalRead, osmRead, actorUserId, expected) => {
    const item = workAppointmentQueryInternals.toWorkAppointmentItem(record, now, { hospitalRead, osmRead, actorUserId });
    expect(item).toMatchObject({ serviceCode: "EMPOWERMENT", source: "PATIENT_REQUEST", isOneOffVisit: expected });
    expect(Object.keys(item).sort()).toEqual(["appointmentId", "relationshipId", "scheduledAt", "durationMinutes", "type", "locationType", "status", "patientDisplayName", "hospitalName", "responsibleDisplayName", "responsibleProfession", "osmAtCreationDisplayName", "pendingRequestBadges", "hasUnassignedOsm", "osmAcceptanceStatus", "serviceCode", "source", "isOneOffVisit"].sort());
  });

  it("keeps hospital bookings hospital-sourced even when a service is selected", () => {
    expect(workAppointmentQueryInternals.toWorkAppointmentItem({ ...record, sourceServiceRequestId: null }, now, { hospitalRead: true, osmRead: false, actorUserId: "staff" }))
      .toMatchObject({ serviceCode: "EMPOWERMENT", source: "HOSPITAL", isOneOffVisit: false });
  });
});
