import { describe, expect, it } from "vitest";
import { personalWeightGoalCreateSchema, personalWeightGoalReadSchema, personalWeightGoalRemoveSchema, personalWeightGoalUpdateSchema } from "./personal-weight-goal-schemas";

const nonce = "11111111-1111-4111-8111-111111111111";
const goalId = "22222222-2222-4222-8222-222222222222";
const version = "2026-10-04T00:00:00.000Z";

describe("Personal Weight Goal transport schemas", () => {
  it("requires a bounded decimal string and canonicalizes it before service use", () => {
    for (const value of ["0.001", "1", "72.5", "72.55", "72.555", "070", "070.5", "70.50", "70.500", "1000000", "1000000.000"]) {
      expect(personalWeightGoalCreateSchema.safeParse({ submissionNonce: nonce, targetWeightKg: value }).success).toBe(true);
    }
    expect(personalWeightGoalCreateSchema.parse({ submissionNonce: nonce, targetWeightKg: "070.500" }).targetWeightKg).toBe("70.5");
    expect(personalWeightGoalCreateSchema.safeParse({ submissionNonce: nonce, targetWeightKg: 72.5 }).success).toBe(false);
  });

  it("normalizes an omitted or blank create date to null and retains structurally valid past dates", () => {
    expect(personalWeightGoalCreateSchema.parse({ submissionNonce: nonce, targetWeightKg: "72.5" }).targetDate).toBeNull();
    expect(personalWeightGoalCreateSchema.parse({ submissionNonce: nonce, targetWeightKg: "72.5", targetDate: "" }).targetDate).toBeNull();
    expect(personalWeightGoalCreateSchema.parse({ submissionNonce: nonce, targetWeightKg: "72.5", targetDate: "2020-02-29" }).targetDate).toBe("2020-02-29");
  });

  it("requires an explicit edit date, including blank to clear", () => {
    const base = { goalId, expectedUpdatedAt: version, targetWeightKg: "72.5" };
    expect(personalWeightGoalUpdateSchema.safeParse(base).success).toBe(false);
    expect(personalWeightGoalUpdateSchema.parse({ ...base, targetDate: "" }).targetDate).toBeNull();
    expect(personalWeightGoalUpdateSchema.parse({ ...base, targetDate: "2026-10-01" }).targetDate).toBe("2026-10-01");
  });

  it("requires millisecond offset timestamps and exact UUIDs, rejects unknown fields", () => {
    const valid = { goalId, expectedUpdatedAt: "2026-10-04T07:00:00.000+07:00", targetWeightKg: "1", targetDate: "" };
    expect(personalWeightGoalUpdateSchema.safeParse(valid).success).toBe(true);
    for (const expectedUpdatedAt of ["2026-10-04T00:00:00Z", "2026-10-04T00:00:00.00Z", "2026-10-04T00:00:00.000Z\n", "2026-02-30T00:00:00.000Z"]) {
      expect(personalWeightGoalUpdateSchema.safeParse({ ...valid, expectedUpdatedAt }).success).toBe(false);
    }
    expect(personalWeightGoalUpdateSchema.safeParse({ ...valid, currentWeight: "70" }).success).toBe(false);
    expect(personalWeightGoalRemoveSchema.safeParse({ goalId, expectedUpdatedAt: version, patientProfileId: nonce }).success).toBe(false);
    expect(personalWeightGoalReadSchema.safeParse({ patientProfileId: nonce }).success).toBe(false);
  });
});
