import { describe, expect, it } from "vitest";

import {
  patientAccessRequestReviewSchema,
  publicPatientAccessRequestSchema,
} from "./patient-access-request-schemas";

const nationalId = "1000000000009";
const hospitalId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";

describe("Patient access request schemas", () => {
  it("accepts only the bounded public reference fields", () => {
    expect(publicPatientAccessRequestSchema.safeParse({ nationalId, hospitalId }).success).toBe(true);
    expect(
      publicPatientAccessRequestSchema.safeParse({ nationalId, hospitalId, password: "secret" }).success,
    ).toBe(false);
  });

  it("requires direct identity verification attestation and matching National ID input before approval", () => {
    expect(
      patientAccessRequestReviewSchema.safeParse({
        requestId,
        decision: "APPROVE",
        nationalId,
        identityVerified: true,
      }).success,
    ).toBe(true);
    expect(
      patientAccessRequestReviewSchema.safeParse({ requestId, decision: "APPROVE", nationalId }).success,
    ).toBe(false);
    expect(
      patientAccessRequestReviewSchema.safeParse({
        requestId,
        decision: "APPROVE",
        identityVerified: true,
      }).success,
    ).toBe(false);
  });

  it("does not accept identity inputs on rejection", () => {
    expect(patientAccessRequestReviewSchema.safeParse({ requestId, decision: "REJECT" }).success).toBe(true);
    expect(
      patientAccessRequestReviewSchema.safeParse({ requestId, decision: "REJECT", nationalId }).success,
    ).toBe(false);
  });
});
