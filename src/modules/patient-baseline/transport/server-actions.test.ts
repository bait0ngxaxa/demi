import { describe, expect, it, vi } from "vitest";
import { ensureServerEntryExports } from "next/dist/build/webpack/loaders/next-flight-loader/action-validate";

import { ConflictError, ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

const mockedCreatePatientBaseline = vi.hoisted(() => vi.fn());
const mockedGetProtectedApplicationActor = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: mockedRevalidatePath,
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));

vi.mock("../services/patient-baseline-service", () => ({
  createPatientBaseline: mockedCreatePatientBaseline,
}));

import { initialPatientBaselineActionState } from "./action-state";
import { patientBaselineTransportInternals } from "./server-action-helpers";
import * as patientBaselineServerActions from "./server-actions";
import { createPatientBaselineAction } from "./server-actions";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const baselineId = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "33333333-3333-4333-8333-333333333333" };

function validFormData(): FormData {
  const formData = new FormData();
  formData.set("patientHospitalRelationshipId", relationshipId);
  formData.set("recordedOn", "2026-08-17");
  formData.set("weight", "72.5");
  formData.set("waistCircumference", "");
  formData.set("bloodPressureSystolic", "120");
  formData.set("bloodPressureDiastolic", "80");
  formData.set("bloodSugarDtx", "");
  formData.set("adaptationSummary", "สรุปการปรับตัว");
  formData.set("adaptationObstacles", "");
  formData.set("adaptationOpportunities", "โอกาส");
  formData.set("confidenceScore", "0");
  formData.set("confidenceImprovementPlan", "");
  formData.set("summary", "สรุป");
  formData.set("recommendations", "");
  return formData;
}

describe("Patient Baseline transport", () => {
  it("exports only values accepted by the Next.js Server Action runtime", () => {
    expect(() => ensureServerEntryExports(Object.values(patientBaselineServerActions))).not.toThrow();
  });

  it("parses allowed form fields and structural numbers only", () => {
    const input = patientBaselineTransportInternals.buildSubmissionInput(validFormData()) as Record<
      string,
      unknown
    >;

    expect(input).toMatchObject({
      patientHospitalRelationshipId: relationshipId,
      recordedOn: "2026-08-17",
      weight: 72.5,
      waistCircumference: null,
      confidenceScore: 0,
    });
  });

  it("maps every empty optional measurement to null", () => {
    const formData = validFormData();

    for (const field of [
      "weight",
      "waistCircumference",
      "bloodPressureSystolic",
      "bloodPressureDiastolic",
      "bloodSugarDtx",
    ]) {
      formData.set(field, "");
    }

    const input = patientBaselineTransportInternals.buildSubmissionInput(formData) as Record<string, unknown>;

    expect(input).toMatchObject({
      weight: null,
      waistCircumference: null,
      bloodPressureSystolic: null,
      bloodPressureDiastolic: null,
      bloodSugarDtx: null,
    });
  });

  it("rejects duplicate, unknown, and browser authority fields", () => {
    const duplicate = validFormData();
    duplicate.append("weight", "73");
    expect(patientBaselineTransportInternals.hasUnexpectedOrDuplicateFields(duplicate)).toBe(true);

    const authority = validFormData();
    authority.set("recordedByUserId", "44444444-4444-4444-8444-444444444444");
    expect(patientBaselineTransportInternals.buildSubmissionInput(authority)).toBeNull();
  });

  it("keeps malformed numeric input visible to schema validation", () => {
    const malformed = validFormData();
    malformed.set("weight", "not-a-number");

    const input = patientBaselineTransportInternals.buildSubmissionInput(malformed) as Record<string, unknown>;

    expect(input.weight).toBeNaN();
  });

  it("maps application failures to safe user-facing Thai messages", () => {
    expect(patientBaselineTransportInternals.mapPatientBaselineError(new ValidationError("internal"))).toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(patientBaselineTransportInternals.mapPatientBaselineError(new ForbiddenError("internal"))).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(patientBaselineTransportInternals.mapPatientBaselineError(new ConflictError("internal"))).toMatchObject({
      code: "CONFLICT",
    });
    const safeError = patientBaselineTransportInternals.mapPatientBaselineError(
      new InfrastructureError("secret path"),
    );
    expect(safeError).toMatchObject({ code: "UNAVAILABLE" });
    expect(JSON.stringify(safeError)).not.toContain("secret path");
  });

  it("derives the actor server-side, creates once, and revalidates the relationship views", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);
    mockedCreatePatientBaseline.mockResolvedValue({
      patientBaselineId: baselineId,
      patientHospitalRelationshipId: relationshipId,
      recordedOn: new Date("2026-08-17T00:00:00.000Z"),
    });

    const result = await createPatientBaselineAction(
      initialPatientBaselineActionState,
      validFormData(),
    );

    expect(result).toMatchObject({
      status: "SUCCESS",
      result: {
        patientBaselineId: baselineId,
        patientHospitalRelationshipId: relationshipId,
        recordedOn: "2026-08-17",
      },
    });
    expect(mockedCreatePatientBaseline).toHaveBeenCalledWith(
      actor,
      expect.not.objectContaining({ recordedByUserId: expect.anything() }),
    );
    expect(mockedRevalidatePath).toHaveBeenNthCalledWith(1, `/app/patients/${relationshipId}`);
    expect(mockedRevalidatePath).toHaveBeenNthCalledWith(2, `/app/patients/${relationshipId}/baseline`);
  });

  it("returns a safe conflict state for a duplicate submission", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);
    mockedCreatePatientBaseline.mockRejectedValueOnce(new ConflictError("internal duplicate"));

    await expect(
      createPatientBaselineAction(initialPatientBaselineActionState, validFormData()),
    ).resolves.toMatchObject({
      status: "ERROR",
      code: "CONFLICT",
    });
  });
});
