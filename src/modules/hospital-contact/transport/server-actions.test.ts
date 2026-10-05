import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  revalidatePath: vi.fn(),
  readContact: vi.fn(),
  updateContact: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.getActor,
}));
vi.mock("../services/hospital-contact-service", () => ({
  readHospitalContactForOwner: mocks.readContact,
  updateHospitalContact: mocks.updateContact,
}));

import {
  readHospitalContactForOwnerAction,
  updateHospitalContactAction,
} from "./server-actions";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const actor = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: ["HOSPITAL"],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};
const projection = {
  hospital: { id: hospitalId, hospitalCode: "H-001", name: "โรงพยาบาล ก" },
  addressText: "ถนนสุขภาพ",
  phoneNumber: null,
  expectedUpdatedAt: "2026-10-05T02:03:04.005Z",
};

function mutationInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hospitalId,
    expectedUpdatedAt: null,
    addressText: "ถนนสุขภาพ",
    phoneNumber: null,
    ...overrides,
  };
}

describe("Hospital Contact Server Action boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActor.mockResolvedValue(actor);
  });

  it("resolves the actor on the server, forwards bounded input, and revalidates fixed routes", async () => {
    mocks.updateContact.mockResolvedValue({ outcome: "CREATED", contact: projection });

    const result = await updateHospitalContactAction(mutationInput());

    expect(mocks.getActor).toHaveBeenCalledOnce();
    expect(mocks.updateContact).toHaveBeenCalledWith(actor, mutationInput());
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/hospitals/contact");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/personal");
    expect(result).toEqual({ status: "SUCCESS", result: { outcome: "CREATED", contact: projection } });
    expect(JSON.stringify(result)).not.toContain("HospitalContact");
  });

  it.each(["UPDATED", "NOOP"] as const)("returns %s as a confirmed result without changing its meaning", async (outcome) => {
    mocks.updateContact.mockResolvedValue({ outcome, contact: projection });

    await expect(updateHospitalContactAction(mutationInput())).resolves.toEqual({
      status: "SUCCESS",
      result: { outcome, contact: projection },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/hospitals/contact");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/personal");
  });

  it("rejects extra client authority fields and never echoes submitted contact values", async () => {
    const secretAddress = "ที่อยู่ที่ห้ามสะท้อนใน error";
    const result = await updateHospitalContactAction({
      ...mutationInput({ addressText: secretAddress }),
      actorUserId: "99999999-9999-4999-8999-999999999999",
      role: "ADMIN",
      membershipType: "OWNER",
    });

    expect(result).toMatchObject({ status: "ERROR", code: "VALIDATION" });
    expect(mocks.getActor).toHaveBeenCalledOnce();
    expect(mocks.updateContact).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(secretAddress);
    expect(JSON.stringify(result)).not.toContain("99999999");
    expect(JSON.stringify(result)).not.toContain("ADMIN");
    expect(JSON.stringify(result)).not.toContain("OWNER");
  });

  it("maps stale conflicts to manual reconciliation without revalidation or retry", async () => {
    mocks.updateContact.mockRejectedValue(new ConflictError("submitted address must not appear"));

    const result = await updateHospitalContactAction(mutationInput());

    expect(result).toMatchObject({ status: "ERROR", code: "CONFLICT" });
    expect(JSON.stringify(result)).not.toContain("submitted address");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps an unknown commit outcome distinct from unavailable and does not replay it", async () => {
    mocks.updateContact.mockResolvedValue({ outcome: "UNCONFIRMED" });

    await expect(updateHospitalContactAction(mutationInput())).resolves.toEqual({ status: "UNCONFIRMED" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([new ForbiddenError(), new NotFoundError()])("withholds read result after scope denial", async (error) => {
    mocks.readContact.mockRejectedValue(error);

    await expect(readHospitalContactForOwnerAction(hospitalId)).resolves.toEqual({ status: "FORBIDDEN" });
  });

  it("keeps load failure distinct from confirmed empty contact", async () => {
    mocks.readContact.mockRejectedValue(new InfrastructureError("private database message"));

    const result = await readHospitalContactForOwnerAction(hospitalId);

    expect(result).toEqual({ status: "UNAVAILABLE" });
    expect(JSON.stringify(result)).not.toContain("private database message");
  });
});
