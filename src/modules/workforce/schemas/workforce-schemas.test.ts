import { Profession } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hospitalMemberProvisionSchema,
  workforceContactPhoneSchema,
  osmProvisionSchema,
  workforceActivationCompletionSchema,
} from "./workforce-schemas";

const targetHospitalId = "11111111-1111-4111-8111-111111111111";
const checksumInvalidNationalId = "1111111111111";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("workforce National ID schemas", () => {
  it("accepts synthetic IDs for workforce provisioning and activation in a production-mode build", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", "true");

    expect(
      hospitalMemberProvisionSchema.safeParse({
        nationalId: checksumInvalidNationalId,
        givenName: "ตัวอย่าง",
        familyName: "บุคลากร",
        contactPhone: "081-234-5678",
        targetHospitalId,
        profession: Profession.NURSE,
      }).success,
    ).toBe(true);
    expect(
      osmProvisionSchema.safeParse({
        nationalId: checksumInvalidNationalId,
        givenName: "ตัวอย่าง",
        familyName: "อสม.",
        contactPhone: "02 123 4567",
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

describe("workforce contact phones", () => {
  it.each([
    ["081-234-5678", "0812345678"], [" 069 123 4567 ", "0691234567"],
    ["0912345678", "0912345678"], ["02-123-4567", "021234567"], ["053 123 456", "053123456"],
    ["07-123-4567", "071234567"],
  ])("normalizes %s", (input, expected) => {
    expect(workforceContactPhoneSchema.parse(input)).toBe(expected);
  });
  it.each([undefined, null, "", " ", "061234567", "081234567", "091234567", "012345678", "0212345678", "0712345678", "+66812345678", "181234567", "08123456789", "๐๘๑๒๓๔๕๖๗๘", "0812345678\n", "081\t2345678", "081\u200b2345678", "081\u202e2345678", "081\ufeff2345678", "081\ud8002345678", "(02)1234567"])("rejects %s", (input) => {
    expect(workforceContactPhoneSchema.safeParse(input).success).toBe(false);
  });
  it.each([hospitalMemberProvisionSchema, osmProvisionSchema])("requires a phone at provisioning", (schema) => {
    expect(schema.safeParse({ nationalId: "1000000000009", givenName: "สมใจ", familyName: "ใจดี", targetHospitalId, ...(schema === hospitalMemberProvisionSchema ? { profession: "NURSE" } : {}) }).success).toBe(false);
  });
});
