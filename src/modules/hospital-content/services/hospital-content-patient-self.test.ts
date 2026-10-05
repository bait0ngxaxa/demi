import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role, type PrismaClient } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";
import { hospitalContentPatientPersonWhere, resolveHospitalContentPatientSelf } from "./hospital-content-patient-self";

const actor: ActorContext = { userId: "u", personId: "p", roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
const profile = vi.fn();
const relationship = vi.fn();
const database = { patientProfile: { findFirst: profile }, patientHospitalRelationship: { findFirst: relationship } } as unknown as PrismaClient;
beforeEach(() => { vi.resetAllMocks(); profile.mockResolvedValue({ id: "profile" }); relationship.mockResolvedValue({ id: "relationship" }); });
describe("Patient Content persisted SELF statements", () => {
  it("selects only Profile identity and re-proves full SELF in the top-level ACTIVE Hospital relationship query", async () => {
    expect(await resolveHospitalContentPatientSelf(actor, database)).toEqual({ patientProfileId: "profile", hasEligibleHospital: true });
    const person = hospitalContentPatientPersonWhere(actor);
    expect(person).toEqual({ id: "p", user: { is: { id: "u", personId: "p", status: "ACTIVE", roles: { some: { role: "PATIENT" } } } } });
    expect(profile).toHaveBeenCalledExactlyOnceWith({ where: { person: { is: person } }, select: { id: true } });
    expect(relationship).toHaveBeenCalledExactlyOnceWith({ where: {
      patientProfileId: "profile", patientProfile: { is: { id: "profile", person: { is: person } } },
      hospital: { is: { status: "ACTIVE" } },
    }, select: { id: true } });
  });
  it("rechecks SELF after zero relationships and returns legitimate absence", async () => {
    relationship.mockResolvedValue(null);
    expect(await resolveHospitalContentPatientSelf(actor, database)).toEqual({ patientProfileId: "profile", hasEligibleHospital: false });
    expect(profile).toHaveBeenCalledTimes(2);
    expect(profile.mock.calls[1]).toEqual(profile.mock.calls[0]);
  });
  it("uses current rechecked Profile identity after replacement", async () => {
    relationship.mockResolvedValue(null); profile.mockResolvedValueOnce({ id: "old" }).mockResolvedValueOnce({ id: "new" });
    expect(await resolveHospitalContentPatientSelf(actor, database)).toEqual({ patientProfileId: "new", hasEligibleHospital: false });
  });
  it("fails Forbidden when SELF is lost before the relationship statement", async () => {
    relationship.mockResolvedValue(null); profile.mockResolvedValueOnce({ id: "profile" }).mockResolvedValueOnce(null);
    await expect(resolveHospitalContentPatientSelf(actor, database)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("rejects missing initial SELF without querying relationships", async () => {
    profile.mockResolvedValue(null);
    await expect(resolveHospitalContentPatientSelf(actor, database)).rejects.toBeInstanceOf(ForbiddenError);
    expect(relationship).not.toHaveBeenCalled();
  });
  it("keeps relationship database failure distinct from absence", async () => {
    relationship.mockRejectedValue(new Error("internal"));
    await expect(resolveHospitalContentPatientSelf(actor, database)).rejects.toBeInstanceOf(InfrastructureError);
  });
});
