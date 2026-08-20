import { describe, expect, it } from "vitest";

import {
  createThaiNationalIdSchema,
  isTestNationalIdBypassEnabled,
  thaiNationalIdSchema,
} from "./identity-schemas";

const validNationalId = "1000000000009";
const checksumInvalidNationalId = "1111111111111";

describe("Thai National ID validation", () => {
  it("accepts a valid Thai National ID in strict mode", () => {
    expect(createThaiNationalIdSchema().safeParse(validNationalId).success).toBe(true);
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
    expect(createThaiNationalIdSchema().safeParse(checksumInvalidNationalId).success).toBe(
      false,
    );
  });

  it.each([
    { nodeEnv: "development", allowTestNationalIds: "true", accepted: true },
    { nodeEnv: "test", allowTestNationalIds: "true", accepted: true },
    { nodeEnv: "production", allowTestNationalIds: "true", accepted: false },
    { nodeEnv: undefined, allowTestNationalIds: "true", accepted: false },
    { nodeEnv: "staging", allowTestNationalIds: "true", accepted: false },
    { nodeEnv: "development", allowTestNationalIds: "false", accepted: false },
    { nodeEnv: "development", allowTestNationalIds: undefined, accepted: false },
  ])(
    "allows checksum bypass only for the explicit environment allowlist: $nodeEnv + $allowTestNationalIds",
    ({ nodeEnv, allowTestNationalIds, accepted }) => {
      const environment = { nodeEnv, allowTestNationalIds };

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
      allowTestNationalIds: "true",
    });

    expect(schema.safeParse("100000000000").success).toBe(false);
    expect(schema.safeParse("100000000000a").success).toBe(false);
    expect(schema.safeParse("9000000000000").success).toBe(false);
  });

  it("keeps production strict even when the bypass flag is enabled", () => {
    expect(
      createThaiNationalIdSchema({
        nodeEnv: "production",
        allowTestNationalIds: "true",
      }).safeParse(checksumInvalidNationalId).success,
    ).toBe(false);
  });

  it("keeps the application schema strict unless the process opt-in is enabled", () => {
    expect(thaiNationalIdSchema.safeParse(validNationalId).success).toBe(true);
    expect(thaiNationalIdSchema.safeParse(checksumInvalidNationalId).success).toBe(false);
  });
});
