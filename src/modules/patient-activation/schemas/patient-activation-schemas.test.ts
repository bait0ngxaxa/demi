import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PATIENT_ACTIVATION_HOSPITAL_NUMBER_MAX_LENGTH,
  PATIENT_ACTIVATION_NAME_MAX_LENGTH,
  patientActivationLookupSchema,
} from "./patient-activation-schemas";

const targetHospitalId = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("patient activation lookup schema", () => {
  it("accepts name, National ID, and HN lookup types", () => {
    expect(
      patientActivationLookupSchema.safeParse({
        targetHospitalId,
        lookupType: "NAME",
        value: "สมชาย ใจดี",
      }).success,
    ).toBe(true);
    expect(
      patientActivationLookupSchema.safeParse({
        targetHospitalId,
        lookupType: "NATIONAL_ID",
        value: "1000000000009",
      }).success,
    ).toBe(true);
    expect(
      patientActivationLookupSchema.safeParse({
        targetHospitalId,
        lookupType: "HOSPITAL_NUMBER",
        value: "HN-001",
      }).success,
    ).toBe(true);
  });

  it("keeps name and HN input lengths bounded independently", () => {
    expect(
      patientActivationLookupSchema.safeParse({
        targetHospitalId,
        lookupType: "NAME",
        value: "ก".repeat(PATIENT_ACTIVATION_NAME_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      patientActivationLookupSchema.safeParse({
        targetHospitalId,
        lookupType: "HOSPITAL_NUMBER",
        value: "H".repeat(PATIENT_ACTIVATION_HOSPITAL_NUMBER_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("accepts checksum-invalid synthetic National ID lookup in production-mode UAT", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMI_DEPLOYMENT_STAGE", "uat");
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", "true");

    expect(
      patientActivationLookupSchema.safeParse({
        targetHospitalId,
        lookupType: "NATIONAL_ID",
        value: "1111111111111",
      }).success,
    ).toBe(true);
    expect(
      patientActivationLookupSchema.safeParse({
        targetHospitalId,
        lookupType: "NATIONAL_ID",
        value: "100000000000a",
      }).success,
    ).toBe(false);
  });
});
