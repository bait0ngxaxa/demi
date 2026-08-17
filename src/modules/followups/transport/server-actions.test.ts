import { describe, expect, it } from "vitest";

import { ConflictError, ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import { followupTransportInternals } from "./server-actions";

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

describe("Follow-up transport", () => {
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
