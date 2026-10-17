import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  end: vi.fn(),
  status: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("../services/patient-hospital-relationship-end-service", () => ({
  endPatientHospitalRelationship: mocks.end,
  getPatientHospitalRelationshipEndStatus: mocks.status,
}));

import { endPatientHospitalRelationshipAction, verifyPatientHospitalRelationshipEndAction } from "./server-actions";

const hospitalId = "22222222-2222-4222-8222-222222222222";
const idle = { status: "IDLE", message: "" } as const;

function form(): FormData {
  const formData = new FormData();
  formData.set("endReason", "ย้ายออก");
  formData.set("confirmRetention", "true");
  return formData;
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.actor.mockResolvedValue({ userId: "owner-1" });
});

describe("Patient Care End action", () => {
  it("redirects to the Patient list after the end commits and returns no state", async () => {
    mocks.end.mockResolvedValue({ hospitalId });
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(endPatientHospitalRelationshipAction("relationship-1", idle, form())).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.end).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith(`/app/patients?hospitalId=${hospitalId}`);
  });

  it.each([
    [new ValidationError("bad"), "INVALID_INPUT"],
    [new ConflictError("changed"), "CONFLICT"],
    [new ForbiddenError(), "FORBIDDEN"],
    [new NotFoundError(), "FORBIDDEN"],
    [new Error("database connection lost"), "UNAVAILABLE"],
  ])("maps %s to the %s code without redirecting", async (error, code) => {
    mocks.end.mockRejectedValue(error);

    const result = await endPatientHospitalRelationshipAction("relationship-1", idle, form());

    expect(result).toMatchObject({ status: "ERROR", code });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("verifies read-only and reports UNRESOLVED instead of failing when the check itself fails", async () => {
    mocks.status.mockRejectedValue(new Error("down"));

    await expect(verifyPatientHospitalRelationshipEndAction("relationship-1")).resolves.toBe("UNRESOLVED");

    mocks.status.mockResolvedValue("ENDED");
    await expect(verifyPatientHospitalRelationshipEndAction("relationship-1")).resolves.toBe("ENDED");
    expect(mocks.end).not.toHaveBeenCalled();
  });
});
