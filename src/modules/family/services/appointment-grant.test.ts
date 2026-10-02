import { afterEach, describe, expect, it, vi } from "vitest";
import { isFamilyDelegatedAppointmentReadEnabled } from "@/lib/env/server";
import { appointmentGrantIdSchema, proposeAppointmentGrantSchema } from "../schemas/appointment-grant-schemas";
import { appointmentGrantCaregiverWhere } from "../policies/appointment-grant-policy";
import { acceptAppointmentGrant, appointmentGrantNow, proposeAppointmentGrant, revokeAppointmentGrant } from "./appointment-grant-service";
import { delegatedAppointmentSelect, getDelegatedAppointment, listDelegatedAppointments } from "./delegated-appointment-query-service";
import { appointmentGrantManagementSelects, getAppointmentGrantManagement } from "./appointment-grant-management-query-service";

const caregiver = { userId: "11111111-1111-4111-8111-111111111111", personId: "22222222-2222-4222-8222-222222222222", roles: [], hospitalMemberships: [], osmHospitalRelationships: [] };
afterEach(() => { vi.unstubAllEnvs(); });

describe("appointment grant contract and gate", () => {
  it.each([undefined, "false", "TRUE", "1", "yes", "", " true "])("defaults/fails closed for %s in all environments", (value) => {
    vi.stubEnv("FAMILY_DELEGATED_APPOINTMENT_READ_ENABLED", value);
    for (const env of ["test", "development", "production"]) { vi.stubEnv("NODE_ENV", env); expect(isFamilyDelegatedAppointmentReadEnabled()).toBe(false); }
  });
  it("enables only explicit lower-case true", () => { vi.stubEnv("FAMILY_DELEGATED_APPOINTMENT_READ_ENABLED", "true"); expect(isFamilyDelegatedAppointmentReadEnabled()).toBe(true); });
  it("strict input has only two locators, never client-selected authority", () => {
    const input = { caregiverRelationshipId: caregiver.userId, patientHospitalRelationshipId: caregiver.personId };
    expect(proposeAppointmentGrantSchema.safeParse(input).success).toBe(true);
    for (const key of ["patientProfileId", "caregiverUserId", "hospitalId", "status", "contractVersion", "fields", "capability", "role"]) expect(proposeAppointmentGrantSchema.safeParse({ ...input, [key]: "untrusted" }).success).toBe(false);
    expect(appointmentGrantIdSchema.safeParse("not-a-uuid").success).toBe(false);
  });
  it("disabled gate stops all operations before database and leaves management absent", async () => {
    const deps = { enabled: false };
    for (const operation of [() => proposeAppointmentGrant(caregiver, {}, deps), () => acceptAppointmentGrant(caregiver, caregiver.userId, deps),
      () => revokeAppointmentGrant(caregiver, caregiver.userId, deps), () => listDelegatedAppointments(caregiver, {}, deps), () => getDelegatedAppointment(caregiver, caregiver.userId, caregiver.personId, deps)]) await expect(operation()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await getAppointmentGrantManagement(caregiver, {}, deps)).toBeNull();
  });
  it("dedicated select fetches exactly locators plus five appointment source fields", () => {
    expect(delegatedAppointmentSelect).toEqual({ id: true, type: true, scheduledAt: true, durationMinutes: true, locationType: true, status: true });
    const serialized = JSON.stringify(appointmentGrantManagementSelects);
    expect(serialized).not.toMatch(/hospitalNumber|hospitalCode|dateOfBirth|identityKeyHash|phone|email|appointments|note|locationDetail/);
  });
  it("requires current known accepted account-bound authority without caregiver role inheritance", () => {
    const where = appointmentGrantCaregiverWhere(caregiver, "ACTIVE");
    expect(where).toMatchObject({ contractVersion: "family-appointment-read-v1", status: "ACTIVE", acceptedByUserId: caregiver.userId,
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
