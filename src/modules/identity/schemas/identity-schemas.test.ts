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
      createThaiNationalIdSchema({ allowChecksumBypass: true }).safeParse(
        "9000000000000",
      ).success,
    ).toBe(false);
  });

  it("rejects a checksum-invalid ID in strict mode", () => {
    expect(createThaiNationalIdSchema().safeParse(checksumInvalidNationalId).success).toBe(
      false,
    );
  });

  it("allows a checksum-invalid 13-digit ID only with the explicit bypass", () => {
    expect(
      createThaiNationalIdSchema({ allowChecksumBypass: true }).safeParse(
        checksumInvalidNationalId,
      ).success,
    ).toBe(true);
  });

  it("ignores the bypass when the runtime is production", () => {
    expect(
      isTestNationalIdBypassEnabled({
        nodeEnv: "production",
        allowTestNationalIds: "true",
      }),
    ).toBe(false);
    expect(
      createThaiNationalIdSchema({
        allowChecksumBypass: true,
        environment: { nodeEnv: "production" },
      }).safeParse(checksumInvalidNationalId).success,
    ).toBe(false);
  });

  it("requires an explicit true opt-in outside production", () => {
    expect(
      isTestNationalIdBypassEnabled({
        nodeEnv: "development",
        allowTestNationalIds: "false",
      }),
    ).toBe(false);
    expect(
      isTestNationalIdBypassEnabled({
        nodeEnv: "test",
        allowTestNationalIds: "true",
      }),
    ).toBe(true);
  });

  it("keeps the application schema strict unless the process opt-in is enabled", () => {
    expect(thaiNationalIdSchema.safeParse(validNationalId).success).toBe(true);
    expect(thaiNationalIdSchema.safeParse(checksumInvalidNationalId).success).toBe(false);
  });
});
