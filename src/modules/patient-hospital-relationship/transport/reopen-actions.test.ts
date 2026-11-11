import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  PatientHospitalRelationshipReopenHospitalInactiveError,
  previewPatientHospitalRelationshipReopen,
  reopenPatientHospitalRelationship,
} from "../services/patient-hospital-relationship-reopen-service";
import { previewPatientCareReopenAction, reopenPatientCareAction } from "./reopen-actions";

const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: vi.fn() }));
vi.mock("../services/patient-hospital-relationship-reopen-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/patient-hospital-relationship-reopen-service")>();
  return {
    PatientHospitalRelationshipReopenHospitalInactiveError: original.PatientHospitalRelationshipReopenHospitalInactiveError,
    previewPatientHospitalRelationshipReopen: vi.fn(),
    reopenPatientHospitalRelationship: vi.fn(),
  };
});

const hospitalId = "11111111-1111-4111-8111-111111111111";
const endedAt = new Date("2026-10-16T03:00:00.000Z");

function form(): FormData {
  const data = new FormData();
  data.set("nationalId", "1101700203450");
  data.set("reopenReason", "สิ้นสุดผิดราย");
  data.set("expectedEndedAt", endedAt.toISOString());
  return data;
}

beforeEach(() => {
  vi.mocked(getProtectedApplicationActor).mockReset().mockResolvedValue({ userId: "admin-1" } as never);
  vi.mocked(previewPatientHospitalRelationshipReopen).mockReset().mockResolvedValue({ maskedName: "ส*** ใ***", endedAt });
  vi.mocked(reopenPatientHospitalRelationship).mockReset().mockResolvedValue({
    relationshipId: "relationship-1", hospitalId, reopenedAt: endedAt, maskedName: "ส*** ใ***", activationLinkRequired: true,
  });
  mockedRevalidatePath.mockReset();
});

describe("patient care reopen actions", () => {
  it("returns only the masked name and end time for the confirmation step", async () => {
    expect(await previewPatientCareReopenAction(hospitalId, { status: "IDLE" }, form()))
      .toEqual({ status: "FOUND", maskedName: "ส*** ใ***", endedAt: endedAt.toISOString() });
    expect(previewPatientHospitalRelationshipReopen).toHaveBeenCalledWith({ userId: "admin-1" }, { hospitalId, nationalId: "1101700203450" });
  });

  it("passes the confirmed end to the service and tells the admin an activation link is needed", async () => {
    const result = await reopenPatientCareAction(hospitalId, { status: "IDLE" }, form());

    expect(reopenPatientHospitalRelationship).toHaveBeenCalledWith({ userId: "admin-1" }, {
      hospitalId, nationalId: "1101700203450", reopenReason: "สิ้นสุดผิดราย", expectedEndedAt: endedAt.toISOString(),
    });
    expect(result).toMatchObject({ status: "REOPENED", activationLinkRequired: true });
    expect(result.status === "REOPENED" ? result.message : "").toContain("โรงพยาบาลต้องออกลิงก์เปิดใช้งานให้");
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/app/admin/hospitals/${hospitalId}`);
  });

  it.each([
    [new ValidationError(), "INVALID_INPUT"],
    [new NotFoundError(), "NOT_FOUND"],
    [new PatientHospitalRelationshipReopenHospitalInactiveError(), "HOSPITAL_INACTIVE"],
    [new ConflictError(), "CONFLICT"],
    [new ForbiddenError(), "FORBIDDEN"],
    [new InfrastructureError(), "UNAVAILABLE"],
  ])("classifies %o as %s without revalidating", async (error, code) => {
    vi.mocked(reopenPatientHospitalRelationship).mockRejectedValueOnce(error);

    expect(await reopenPatientCareAction(hospitalId, { status: "IDLE" }, form())).toMatchObject({ status: "ERROR", code });
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });
});
