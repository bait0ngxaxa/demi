import { MembershipType, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";

const mocks = vi.hoisted(() => ({ user: vi.fn(), membership: vi.fn(), request: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => ({ $transaction: mocks.transaction }) }));
import { locateHospitalPatientAccessRequest } from "./patient-access-request-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const nationalId = "1000000000009";
const actor: ActorContext = {
  userId: "reviewer", personId: "person", roles: [Role.HOSPITAL],
  hospitalMemberships: [{ hospitalId, membershipType: MembershipType.MEMBER, profession: null, status: "ACTIVE", hospitalStatus: "ACTIVE" }],
  osmHospitalRelationships: [],
};

describe("Hospital access request locator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ status: "ACTIVE", roles: [{ role: "HOSPITAL" }] });
    mocks.membership.mockResolvedValue({ id: "membership" });
    mocks.request.mockResolvedValue({ id: requestId, status: "PENDING" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      user: { findUnique: mocks.user }, hospitalMembership: { findFirst: mocks.membership }, patientAccessRequest: { findFirst: mocks.request },
    }));
  });

  it.each([MembershipType.OWNER, MembershipType.MEMBER])("allows exact %s and returns only safe locator data", async (membershipType) => {
    const result = await locateHospitalPatientAccessRequest({ ...actor, hospitalMemberships: [{ ...actor.hospitalMemberships[0], membershipType }] }, { hospitalId, nationalId });
    expect(result).toEqual({ requestId, status: "PENDING" });
    expect(mocks.request).toHaveBeenCalledWith({
      where: { hospitalId, identityKeyHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId }), status: { in: ["PENDING", "APPROVED", "ACTIVATION_ISSUED"] } },
      select: { id: true, status: true },
    });
    expect(JSON.stringify(result)).not.toMatch(/identityKeyHash|authSubject|1000000000009/);
  });

  it.each([Role.OSM, Role.PATIENT, Role.ADMIN])("denies %s even with a claimed direct membership", async (role) => {
    await expect(locateHospitalPatientAccessRequest({ ...actor, roles: [role] }, { hospitalId, nationalId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("denies anonymous and unrelated Hospital lookup", async () => {
    await expect(locateHospitalPatientAccessRequest(null, { hospitalId, nationalId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(locateHospitalPatientAccessRequest(actor, { hospitalId: requestId, nationalId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each([
    { status: "SUSPENDED", roles: [{ role: "HOSPITAL" }] },
    { status: "ACTIVE", roles: [{ role: "PATIENT" }] },
    { status: "ACTIVE", roles: [{ role: "HOSPITAL" }, { role: "ADMIN" }] },
  ])("rechecks persisted User state", async (user) => {
    mocks.user.mockResolvedValue(user);
    await expect(locateHospitalPatientAccessRequest(actor, { hospitalId, nationalId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rechecks active direct membership and Hospital", async () => {
    mocks.membership.mockResolvedValue(null);
    await expect(locateHospitalPatientAccessRequest(actor, { hospitalId, nationalId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.membership).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ hospitalId, status: "ACTIVE", hospital: { status: "ACTIVE" } }) }));
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("returns normal no-match and validates canonical input without echoing it", async () => {
    mocks.request.mockResolvedValue(null);
    expect(await locateHospitalPatientAccessRequest(actor, { hospitalId, nationalId })).toBeNull();
    await expect(locateHospitalPatientAccessRequest(actor, { hospitalId, nationalId: "invalid" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
