import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureServerEntryExports } from "next/dist/build/webpack/loaders/next-flight-loader/action-validate";

import { ConflictError, ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

const mockedActor = vi.hoisted(() => vi.fn());
const mockedCreate = vi.hoisted(() => vi.fn());
const mockedCreateForProgram = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("../services/followup-service", () => ({
  createFollowup: mockedCreate,
  createFollowupForProgram: mockedCreateForProgram,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));

import { followupTransportInternals } from "./server-action-helpers";
import * as followupServerActions from "./server-actions";
import { createFollowupForProgramAction } from "./server-actions";
import { initialFollowupActionState } from "./action-state";

function validFormData(): FormData {
  const formData = new FormData();
  formData.set("patientHospitalRelationshipId", "11111111-1111-4111-8111-111111111111");
  formData.set("submissionNonce", "22222222-2222-4222-8222-222222222222");
  formData.set("appointmentId", "");
  formData.set("sourceGoalPlanId", "");
  formData.set("weight", "72.5");
  formData.set("waistCircumference", "");
  formData.set("systolicBloodPressure", "120");
  formData.set("diastolicBloodPressure", "80");
  formData.set("bloodSugar", "");
  formData.set("confidenceScore", "7");
  formData.set("reflectionNote", "สะท้อนแบบต้นแบบ");
  formData.set("confidencePlan", "ทำต่อ");
  formData.set("generalNote", "ทั่วไป");
  formData.set("activityProgress", "[]");
  return formData;
}

function validProgramFormData(): FormData {
  const formData = validFormData();
  formData.delete("patientHospitalRelationshipId");
  formData.set("patientProgramId", "33333333-3333-4333-8333-333333333333");
  return formData;
}

describe("Follow-up transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedActor.mockResolvedValue({ userId: "actor" });
    mockedCreateForProgram.mockResolvedValue({
      followupId: "44444444-4444-4444-8444-444444444444",
      patientProgramId: "33333333-3333-4333-8333-333333333333",
      patientHospitalRelationshipId: "11111111-1111-4111-8111-111111111111",
      hospitalId: "55555555-5555-4555-8555-555555555555",
      roundNumber: 1,
      recordedAt: new Date("2026-08-17T05:00:00.000Z"),
      createdAt: new Date("2026-08-17T05:00:00.000Z"),
    });
  });

  it("exports only values accepted by the Next.js Server Action runtime", () => {
    expect(() => ensureServerEntryExports(Object.values(followupServerActions))).not.toThrow();
  });

  it("parses the allowed form fields and numeric values only", () => {
    const input = followupTransportInternals.buildSubmissionInput(validFormData()) as Record<string, unknown>;

    expect(input).toMatchObject({
      patientHospitalRelationshipId: "11111111-1111-4111-8111-111111111111",
      weight: 72.5,
      waistCircumference: null,
      confidenceScore: 7,
      activityProgress: [],
    });
  });

  it("parses Program-scoped input without accepting relationship authority", () => {
    const input = followupTransportInternals.buildProgramSubmissionInput(
      validProgramFormData(),
    ) as Record<string, unknown>;

    expect(input).toMatchObject({
      patientProgramId: "33333333-3333-4333-8333-333333333333",
      activityProgress: [],
    });

    const withRelationship = validProgramFormData();
    withRelationship.set(
      "patientHospitalRelationshipId",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(followupTransportInternals.buildProgramSubmissionInput(withRelationship)).toBeNull();
  });

  it("passes through a partial Goal activity progress selection", () => {
    const formData = validFormData();
    formData.set(
      "activityProgress",
      JSON.stringify([{ goalActivityCode: "exercise_walk", status: "DONE" }]),
    );

    expect(followupTransportInternals.buildSubmissionInput(formData)).toMatchObject({
      activityProgress: [{ goalActivityCode: "exercise_walk", status: "DONE" }],
    });
  });

  it("rejects duplicate, unknown, and browser authority fields", () => {
    const duplicate = validFormData();
    duplicate.append("weight", "73");
    expect(followupTransportInternals.hasUnexpectedOrDuplicateFields(duplicate)).toBe(true);

    const authority = validFormData();
    authority.set("hospitalId", "33333333-3333-4333-8333-333333333333");
    expect(followupTransportInternals.buildSubmissionInput(authority)).toBeNull();
  });

  it("uses Program follow-up creation and revalidates Program history", async () => {
    const result = await createFollowupForProgramAction(
      initialFollowupActionState,
      validProgramFormData(),
    );

    expect(result).toMatchObject({
      status: "SUCCESS",
      result: { followupId: "44444444-4444-4444-8444-444444444444", roundNumber: 1 },
    });

    const serviceInput = mockedCreateForProgram.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(serviceInput).toMatchObject({
      patientProgramId: "33333333-3333-4333-8333-333333333333",
    });
    expect(serviceInput).not.toHaveProperty("patientHospitalRelationshipId");
    expect(mockedRevalidatePath).toHaveBeenCalledWith(
      "/app/patients/11111111-1111-4111-8111-111111111111/programs/33333333-3333-4333-8333-333333333333",
    );
    expect(mockedRevalidatePath).toHaveBeenCalledWith(
      "/app/patients/11111111-1111-4111-8111-111111111111/programs/33333333-3333-4333-8333-333333333333/followups",
    );
  });

  it("maps application failures to safe Thai messages without exposing internals", () => {
    expect(followupTransportInternals.mapFollowupError(new ValidationError("internal"))).toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(followupTransportInternals.mapFollowupError(new ForbiddenError("internal"))).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(followupTransportInternals.mapFollowupError(new ConflictError("internal"))).toMatchObject({
      code: "CONFLICT",
    });
    expect(followupTransportInternals.mapFollowupError(new InfrastructureError("internal"))).toMatchObject({
      code: "UNAVAILABLE",
    });
    expect(JSON.stringify(followupTransportInternals.mapFollowupError(new InfrastructureError("secret path")))).not.toContain(
      "secret path",
    );
  });
});
