import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  health: vi.fn(),
  profile: vi.fn(),
  correct: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("../services/patient-health-history-service", () => ({ updatePatientHealthHistory: mocks.health }));
vi.mock("../services/patient-hospital-profile-service", () => ({ updateStaffPatientHospitalProfile: mocks.profile }));
vi.mock("../services/patient-name-correction-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/patient-name-correction-service")>()),
  correctPatientName: mocks.correct,
}));

import { PatientNameCorrectionRequiresAdminError } from "../services/patient-name-correction-service";
import {
  correctPatientNameAction,
  savePatientHealthHistoryAction,
  saveStaffPatientHospitalProfileAction,
} from "./hospital-patient-edit-actions";

const idle = { status: "IDLE", message: "" } as const;

function form(): FormData {
  const formData = new FormData();
  formData.set("expectedVersion", "1");
  return formData;
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.actor.mockResolvedValue({ userId: "user-1" });
});

describe.each([
  ["profile", saveStaffPatientHospitalProfileAction, mocks.profile],
  ["health history", savePatientHealthHistoryAction, mocks.health],
  ["name correction", correctPatientNameAction, mocks.correct],
] as const)("%s edit action result codes", (_label, action, service) => {
  it("returns SUCCESS without an error code", async () => {
    service.mockResolvedValue(undefined);

    const result = await action("relationship-1", idle, form());

    expect(result.status).toBe("SUCCESS");
    expect(result).not.toHaveProperty("code");
  });

  it.each([
    [new ConflictError("changed"), "CONFLICT"],
    [new ValidationError("bad"), "INVALID_INPUT"],
    [new ForbiddenError(), "FORBIDDEN"],
    [new NotFoundError(), "FORBIDDEN"],
    [new Error("database connection lost"), "UNAVAILABLE"],
  ])("maps %s to %s", async (error, code) => {
    service.mockRejectedValue(error);

    const result = await action("relationship-1", idle, form());

    expect(result).toMatchObject({ status: "ERROR", code });
  });

  it("reports an unexpected failure after the write as UNAVAILABLE, not as a definitive failure", async () => {
    service.mockResolvedValue(undefined);
    mocks.revalidatePath.mockImplementation(() => {
      throw new Error("revalidate failed");
    });

    const result = await action("relationship-1", idle, form());

    expect(result).toMatchObject({ status: "ERROR", code: "UNAVAILABLE" });
  });
});

describe("name correction restriction", () => {
  it("keeps the multi-Hospital restriction as FORBIDDEN with its administrator guidance", async () => {
    mocks.correct.mockRejectedValue(new PatientNameCorrectionRequiresAdminError());

    const result = await correctPatientNameAction("relationship-1", idle, form());

    expect(result).toEqual({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "ผู้ป่วยรายนี้เชื่อมกับหลายโรงพยาบาล กรุณาติดต่อผู้ดูแลระบบ",
    });
  });
});
