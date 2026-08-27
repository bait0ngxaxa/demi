import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/shared/errors/application-error";

const mockedActor = vi.hoisted(() => vi.fn());
const mockedSetPatientClassification = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("../services/patient-classification-service", () => ({
  setPatientClassification: mockedSetPatientClassification,
}));

import { setPatientClassificationAction } from "./server-actions";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "22222222-2222-4222-8222-222222222222" };

describe("Patient classification Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedActor.mockResolvedValue(actor);
    mockedSetPatientClassification.mockResolvedValue({
      operation: "CHANGED",
      classification: "DIABETES",
    });
  });

  it("uses server actor context and revalidates the affected patient views", async () => {
    const formData = new FormData();
    formData.set("patientHospitalRelationshipId", relationshipId);
    formData.set("classification", "DIABETES");

    await expect(setPatientClassificationAction({ status: "IDLE" }, formData)).resolves.toEqual({
      status: "SUCCESS",
      result: { operation: "CHANGED", classification: "DIABETES" },
    });
    expect(mockedSetPatientClassification).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
      classification: "DIABETES",
    });
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/app/patients/${relationshipId}`);
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/app/patients");
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/app/patients/assigned");
  });

  it("rejects unsupported values and duplicate form fields before the service", async () => {
    const invalidValue = new FormData();
    invalidValue.set("patientHospitalRelationshipId", relationshipId);
    invalidValue.set("classification", "TYPE_2");

    await expect(setPatientClassificationAction({ status: "IDLE" }, invalidValue)).resolves.toEqual({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาเลือกสถานะผู้ป่วยที่รองรับ",
    });

    const duplicateField = new FormData();
    duplicateField.set("patientHospitalRelationshipId", relationshipId);
    duplicateField.append("classification", "RISK");
    duplicateField.append("classification", "DIABETES");

    await expect(setPatientClassificationAction({ status: "IDLE" }, duplicateField)).resolves.toMatchObject({
      status: "ERROR",
      code: "INVALID_INPUT",
    });
    expect(mockedSetPatientClassification).not.toHaveBeenCalled();
  });

  it("returns a safe denial when the service rejects an unauthorized actor", async () => {
    mockedSetPatientClassification.mockRejectedValueOnce(new ForbiddenError());
    const formData = new FormData();
    formData.set("patientHospitalRelationshipId", relationshipId);
    formData.set("classification", "RISK");

    await expect(setPatientClassificationAction({ status: "IDLE" }, formData)).resolves.toEqual({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์เปลี่ยนสถานะผู้ป่วยในโรงพยาบาลนี้",
    });
  });
});
