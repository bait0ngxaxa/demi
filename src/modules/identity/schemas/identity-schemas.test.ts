import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createThaiNationalIdSchema,
  isTestNationalIdBypassEnabled,
  thaiNationalIdSchema,
} from "./identity-schemas";

const validNationalId = "1000000000009";
const checksumInvalidNationalId = "1111111111111";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Thai National ID validation", () => {
  it("accepts a valid Thai National ID regardless of the test override", () => {
    expect(createThaiNationalIdSchema({ allowTestNationalIds: "false" }).safeParse(validNationalId).success).toBe(true);
    expect(createThaiNationalIdSchema({ allowTestNationalIds: "true" }).safeParse(validNationalId).success).toBe(true);
  });

  it.each([undefined, "false", "TRUE", "yes", "1", "invalid"]) (
    "enforces the checksum when DEMI_ALLOW_TEST_NATIONAL_IDS is %j",
    (allowTestNationalIds) => {
      const environment = { allowTestNationalIds };
      expect(isTestNationalIdBypassEnabled(environment)).toBe(false);
      expect(createThaiNationalIdSchema(environment).safeParse(checksumInvalidNationalId).success).toBe(false);
    },
  );

  it("bypasses only the checksum when the test override is explicitly true", () => {
    const schema = createThaiNationalIdSchema({ allowTestNationalIds: "true" });

    expect(schema.safeParse(checksumInvalidNationalId).success).toBe(true);
  });

  it.each([
    ["production", "production"],
    ["development", "production"],
    ["production", "uat"],
  ])("uses the explicit override in NODE_ENV=%s with deployment label %s", (nodeEnv, deploymentStage) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("DEMI_DEPLOYMENT_STAGE", deploymentStage);
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", "true");

    expect(thaiNationalIdSchema.safeParse(checksumInvalidNationalId).success).toBe(true);
  });

  it("uses the explicit override in development mode", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", "true");

    expect(thaiNationalIdSchema.safeParse(checksumInvalidNationalId).success).toBe(true);
  });

  it("reads the override when parsing instead of when imported", () => {
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", undefined);
    expect(thaiNationalIdSchema.safeParse(checksumInvalidNationalId).success).toBe(false);

    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", "true");
    expect(thaiNationalIdSchema.safeParse(checksumInvalidNationalId).success).toBe(true);
  });

  it("always rejects invalid length, non-numeric IDs, and category digits", () => {
    const schema = createThaiNationalIdSchema({ allowTestNationalIds: "true" });

    for (const value of ["100000000000", "10000000000099", "100000000000a", "9000000000000"]) {
      expect(schema.safeParse(value).success).toBe(false);
    }
  });
});
