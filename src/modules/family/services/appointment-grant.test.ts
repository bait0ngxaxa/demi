import { describe, expect, it, vi } from "vitest";
import { appointmentGrantIdSchema, proposeAppointmentGrantSchema } from "../schemas/appointment-grant-schemas";
import { appointmentGrantCaregiverWhere } from "../policies/appointment-grant-policy";
import { appointmentGrantNow } from "./appointment-grant-service";
import { delegatedAppointmentSelect } from "./delegated-appointment-query-service";
import { appointmentGrantManagementSelects } from "./appointment-grant-management-query-service";

const caregiver = { userId: "11111111-1111-4111-8111-111111111111", personId: "22222222-2222-4222-8222-222222222222", roles: [], hospitalMemberships: [], osmHospitalRelationships: [] };

describe("appointment grant contract", () => {
  it("strict input has only two locators, never client-selected authority", () => {
    const input = { caregiverRelationshipId: caregiver.userId, patientHospitalRelationshipId: caregiver.personId };
    expect(proposeAppointmentGrantSchema.safeParse(input).success).toBe(true);
    for (const key of ["patientProfileId", "caregiverUserId", "hospitalId", "status", "contractVersion", "fields", "capability", "role"]) expect(proposeAppointmentGrantSchema.safeParse({ ...input, [key]: "untrusted" }).success).toBe(false);
    expect(appointmentGrantIdSchema.safeParse("not-a-uuid").success).toBe(false);
  });
  it("dedicated select fetches exactly locators plus five appointment source fields", () => {
    expect(delegatedAppointmentSelect).toEqual({ id: true, type: true, scheduledAt: true, durationMinutes: true, locationType: true, status: true });
    const serialized = JSON.stringify(appointmentGrantManagementSelects);
    expect(serialized).not.toMatch(/hospitalNumber|hospitalCode|dateOfBirth|identityKeyHash|phone|email|appointments|note|locationDetail/);
  });
  it("requires current known accepted account-bound authority without caregiver role inheritance", () => {
    const where = appointmentGrantCaregiverWhere(caregiver, "ACTIVE");
    expect(where).toMatchObject({ contractVersion: { in: ["family-appointment-read-v1", "family-appointment-read-v2"] }, status: "ACTIVE", acceptedByUserId: caregiver.userId,
      caregiverUserId: caregiver.userId, caregiverPersonId: caregiver.personId, caregiverUser: { is: { status: "ACTIVE", personId: caregiver.personId } },
      proposedByUser: { is: { status: "ACTIVE", roles: { some: { role: "PATIENT" } } } },
      caregiverRelationship: { is: { status: "ACTIVE", sourceInvitation: { is: { caregiverPersonId: caregiver.personId, status: "ACCEPTED" } } } },
      patientHospitalRelationship: { is: { hospital: { is: { status: "ACTIVE" } } } } });
    expect(JSON.stringify(where)).not.toMatch(/ADMIN|HOSPITAL|OSM|membership|assignment/);
  });
  it("accepts injected valid clock and rejects invalid server time", () => {
    const now = new Date("2026-10-02T00:00:00Z"); const clock = vi.fn(() => now);
    expect(appointmentGrantNow({ now: clock })).toBe(now); expect(clock).toHaveBeenCalledTimes(1);
    expect(() => appointmentGrantNow({ now: () => new Date(NaN) })).toThrow();
  });
});
