import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createThaiNationalIdSchema,
  isTestNationalIdBypassEnabled,
  thaiNationalIdSchema,
} from "./identity-schemas";

const validNationalId = "1000000000009";
const checksumInvalidNationalId = "1111111111111";
const strictEnvironment = {
  nodeEnv: "production",
  deploymentStage: "production",
  allowTestNationalIds: "true",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Thai National ID validation", () => {
  it("accepts a valid Thai National ID in strict mode", () => {
    expect(createThaiNationalIdSchema(strictEnvironment).safeParse(validNationalId).success).toBe(true);
  });

  it("rejects an invalid format", () => {
    const schema = createThaiNationalIdSchema();

    expect(schema.safeParse("100000000000").success).toBe(false);
    expect(schema.safeParse("100000000000a").success).toBe(false);
  });

  it("rejects an invalid category digit even when the checksum bypass is enabled", () => {
    expect(
      createThaiNationalIdSchema({
        nodeEnv: "development",
        allowTestNationalIds: "true",
      }).safeParse("9000000000000").success,
    ).toBe(false);
  });

  it("rejects a checksum-invalid ID in strict mode", () => {
    expect(
      createThaiNationalIdSchema(strictEnvironment).safeParse(checksumInvalidNationalId).success,
    ).toBe(false);
  });

  it.each([
    { nodeEnv: "development", deploymentStage: undefined, allowTestNationalIds: "true", accepted: true },
    { nodeEnv: "development", deploymentStage: "development", allowTestNationalIds: "true", accepted: true },
    { nodeEnv: "test", deploymentStage: undefined, allowTestNationalIds: "true", accepted: true },
    { nodeEnv: "test", deploymentStage: "development", allowTestNationalIds: "true", accepted: true },
    { nodeEnv: "production", deploymentStage: "uat", allowTestNationalIds: "true", accepted: true },
    { nodeEnv: "production", deploymentStage: "production", allowTestNationalIds: "true", accepted: false },
    { nodeEnv: "development", deploymentStage: "production", allowTestNationalIds: "true", accepted: false },
    { nodeEnv: "production", deploymentStage: "development", allowTestNationalIds: "true", accepted: false },
    { nodeEnv: "development", deploymentStage: "uat", allowTestNationalIds: "true", accepted: false },
    { nodeEnv: "test", deploymentStage: "uat", allowTestNationalIds: "true", accepted: false },
    { nodeEnv: "production", deploymentStage: undefined, allowTestNationalIds: "true", accepted: false },
    { nodeEnv: "production", deploymentStage: "staging", allowTestNationalIds: "true", accepted: false },
    { nodeEnv: "production", deploymentStage: "UAT", allowTestNationalIds: "true", accepted: false },
    { nodeEnv: "production", deploymentStage: "", allowTestNationalIds: "true", accepted: false },
    { nodeEnv: "production", deploymentStage: "uat", allowTestNationalIds: "false", accepted: false },
    { nodeEnv: "production", deploymentStage: "uat", allowTestNationalIds: "TRUE", accepted: false },
    { nodeEnv: "development", deploymentStage: "unknown", allowTestNationalIds: "true", accepted: false },
    { nodeEnv: "development", deploymentStage: "development", allowTestNationalIds: "false", accepted: false },
    { nodeEnv: "development", deploymentStage: "development", allowTestNationalIds: undefined, accepted: false },
  ])(
    "applies the explicit stage and opt-in policy: $nodeEnv + $deploymentStage + $allowTestNationalIds",
    ({ nodeEnv, deploymentStage, allowTestNationalIds, accepted }) => {
      const environment = { nodeEnv, deploymentStage, allowTestNationalIds };

      expect(isTestNationalIdBypassEnabled(environment)).toBe(accepted);
      expect(
        createThaiNationalIdSchema(environment).safeParse(checksumInvalidNationalId)
          .success,
      ).toBe(accepted);
    },
  );

  it("keeps format and category validation strict when checksum bypass is enabled", () => {
    const schema = createThaiNationalIdSchema({
      nodeEnv: "development",
      deploymentStage: "development",
      allowTestNationalIds: "true",
    });

    expect(schema.safeParse("100000000000").success).toBe(false);
    expect(schema.safeParse("100000000000a").success).toBe(false);
    expect(schema.safeParse("9000000000000").success).toBe(false);

    for (const categoryDigit of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
      expect(schema.safeParse(`${categoryDigit}${"1".repeat(12)}`).success).toBe(true);
    }
  });

  it("keeps production stage strict even when the bypass flag is enabled", () => {
    expect(
      createThaiNationalIdSchema({
        nodeEnv: "production",
        deploymentStage: "production",
        allowTestNationalIds: "true",
      }).safeParse(checksumInvalidNationalId).success,
    ).toBe(false);
  });

  it("reads the application schema environment when parsing instead of when imported", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMI_DEPLOYMENT_STAGE", "production");
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", "true");

    expect(thaiNationalIdSchema.safeParse(validNationalId).success).toBe(true);
    expect(thaiNationalIdSchema.safeParse(checksumInvalidNationalId).success).toBe(false);

    vi.stubEnv("DEMI_DEPLOYMENT_STAGE", "uat");
    expect(thaiNationalIdSchema.safeParse(checksumInvalidNationalId).success).toBe(true);

    vi.stubEnv("DEMI_DEPLOYMENT_STAGE", "production");
    expect(thaiNationalIdSchema.safeParse(checksumInvalidNationalId).success).toBe(false);
  });
});
