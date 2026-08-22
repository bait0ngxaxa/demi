import { ensureServerEntryExports } from "next/dist/build/webpack/loaders/next-flight-loader/action-validate";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

const mockedActor = vi.hoisted(() => vi.fn());
const mockedCreate = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("../services/patient-final-assessment-service", () => ({
  createPatientFinalAssessment: mockedCreate,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));

import {
  initialPatientFinalAssessmentActionState,
} from "./action-state";
import { patientFinalAssessmentTransportInternals } from "./server-action-helpers";
import * as serverActions from "./server-actions";
import { createPatientFinalAssessmentAction } from "./server-actions";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const finalAssessmentId = "33333333-3333-4333-8333-333333333333";

const actor = {
  userId: "44444444-4444-4444-8444-444444444444",
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
} satisfies ActorContext;

function validFormData(): FormData {
  const formData = new FormData();
  formData.set("patientHospitalRelationshipId", relationshipId);
  formData.set("patientProgramId", programId);
  formData.set("weight", "72.5");
  formData.set("waistCircumference", "");
  formData.set("systolicBloodPressure", "120");
  formData.set("diastolicBloodPressure", "80");
  formData.set("bloodSugar", "95");
  return formData;
}

describe("Patient Final Assessment Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedActor.mockResolvedValue(actor);
    mockedCreate.mockResolvedValue({
      patientFinalAssessmentId: finalAssessmentId,
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId: "66666666-6666-4666-8666-666666666666",
      recordedByUserId: actor.userId,
      recordedAt: new Date("2026-08-22T05:00:00.000Z"),
      createdAt: new Date("2026-08-22T05:00:00.000Z"),
    });
  });

  it("exports only a valid async Server Action", () => {
    expect(() => ensureServerEntryExports(Object.values(serverActions))).not.toThrow();
    expect(Object.keys(serverActions)).toEqual(["createPatientFinalAssessmentAction"]);
    expect(createPatientFinalAssessmentAction.constructor.name).toBe("AsyncFunction");
  });

  it("accepts one or more raw measurements and passes only the narrow payload", async () => {
    const result = await createPatientFinalAssessmentAction(
      initialPatientFinalAssessmentActionState,
      validFormData(),
    );

    expect(result).toMatchObject({
      status: "SUCCESS",
      result: {
        patientFinalAssessmentId: finalAssessmentId,
        patientProgramId: programId,
        patientHospitalRelationshipId: relationshipId,
      },
    });
    expect(mockedCreate).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
      patientProgramId: programId,
      weight: 72.5,
      waistCircumference: null,
      systolicBloodPressure: 120,
      diastolicBloodPressure: 80,
      bloodSugar: 95,
    });
    expect(mockedCreate.mock.calls[0]?.[1]).not.toHaveProperty("recordedByUserId");
    expect(mockedCreate.mock.calls[0]?.[1]).not.toHaveProperty("recordedAt");
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/app/patients/${relationshipId}`);
    expect(mockedRevalidatePath).toHaveBeenCalledWith(
      `/app/patients/${relationshipId}/programs/${programId}`,
    );
  });

  it("rejects empty and structurally invalid measurement submissions before actor resolution", async () => {
    const invalidValues = ["-1", "NaN", "Infinity", "1000001"];

    const empty = validFormData();
    for (const field of [
      "weight",
      "systolicBloodPressure",
      "diastolicBloodPressure",
      "bloodSugar",
    ]) {
      empty.set(field, "");
    }

    await expect(
      createPatientFinalAssessmentAction(initialPatientFinalAssessmentActionState, empty),
    ).resolves.toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });

    for (const value of invalidValues) {
      const formData = validFormData();
      formData.set("weight", value);
      await expect(
        createPatientFinalAssessmentAction(initialPatientFinalAssessmentActionState, formData),
      ).resolves.toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    }

    expect(mockedActor).not.toHaveBeenCalled();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it.each(["unexpected field", "duplicate measurement", "actor field", "recording time field"])(
    "rejects %s without invoking the service",
    async (caseName) => {
      const formData = validFormData();

      if (caseName === "unexpected field") {
        formData.set("hospitalId", "77777777-7777-4777-8777-777777777777");
      }

      if (caseName === "duplicate measurement") {
        formData.append("weight", "73");
      }

      if (caseName === "actor field") {
        formData.set("recordedByUserId", actor.userId);
      }

      if (caseName === "recording time field") {
        formData.set("recordedAt", "2026-08-22T05:00:00.000Z");
      }

      await expect(
        createPatientFinalAssessmentAction(initialPatientFinalAssessmentActionState, formData),
      ).resolves.toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    },
  );

  it("maps application failures to bounded user-facing states without exposing internals", () => {
    expect(
      patientFinalAssessmentTransportInternals.mapPatientFinalAssessmentError(
        new UnauthenticatedError("secret auth detail"),
      ),
    ).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(
      patientFinalAssessmentTransportInternals.mapPatientFinalAssessmentError(
        new ForbiddenError("secret permission detail"),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      patientFinalAssessmentTransportInternals.mapPatientFinalAssessmentError(
        new NotFoundError("secret lookup detail"),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      patientFinalAssessmentTransportInternals.mapPatientFinalAssessmentError(
        new ValidationError("secret validation detail"),
      ),
    ).toMatchObject({ code: "INVALID_INPUT" });
    expect(
      patientFinalAssessmentTransportInternals.mapPatientFinalAssessmentError(
        new ConflictError("secret conflict detail"),
      ),
    ).toMatchObject({ code: "CONFLICT" });
    const infrastructure = patientFinalAssessmentTransportInternals.mapPatientFinalAssessmentError(
      new InfrastructureError("secret database path"),
    );
    expect(infrastructure).toMatchObject({ code: "UNAVAILABLE" });
    expect(JSON.stringify(infrastructure)).not.toContain("secret database path");
  });

  it("maps duplicate and completed-program conflicts safely and refreshes the route", async () => {
    mockedCreate.mockRejectedValue(new ConflictError("P2002 or completed state"));

    await expect(
      createPatientFinalAssessmentAction(initialPatientFinalAssessmentActionState, validFormData()),
    ).resolves.toMatchObject({ status: "ERROR", code: "CONFLICT" });
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });
});
