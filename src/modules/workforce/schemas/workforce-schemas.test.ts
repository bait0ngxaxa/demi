import { Profession } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hospitalMemberProvisionSchema,
  osmProvisionSchema,
  workforceActivationCompletionSchema,
} from "./workforce-schemas";

const targetHospitalId = "11111111-1111-4111-8111-111111111111";
const checksumInvalidNationalId = "1111111111111";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("workforce National ID schemas", () => {
  it("accepts synthetic IDs for workforce provisioning and activation in production-mode UAT", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMI_DEPLOYMENT_STAGE", "uat");
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", "true");

    expect(
      hospitalMemberProvisionSchema.safeParse({
        nationalId: checksumInvalidNationalId,
        givenName: "ตัวอย่าง",
        familyName: "บุคลากร",
        targetHospitalId,
        profession: Profession.NURSE,
      }).success,
    ).toBe(true);
    expect(
      osmProvisionSchema.safeParse({
        nationalId: checksumInvalidNationalId,
        givenName: "ตัวอย่าง",
        familyName: "อสม.",
        targetHospitalId,
      }).success,
    ).toBe(true);
    expect(
      workforceActivationCompletionSchema.safeParse({
        nationalId: checksumInvalidNationalId,
        password: "correct-horse-battery-staple",
        passwordConfirmation: "correct-horse-battery-staple",
      }).success,
    ).toBe(true);
  });
});
