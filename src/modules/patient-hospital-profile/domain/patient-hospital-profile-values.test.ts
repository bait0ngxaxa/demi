import { describe, expect, it } from "vitest";

import {
  applyPatientHospitalProfilePatch,
  resolveEffectivePatientHospitalProfile,
} from "./patient-hospital-profile-values";

const legacy = {
  gender: "ชาย",
  phoneNumber: "0812345678",
  addressText: "ที่อยู่เดิม",
  emergencyContactName: "ผู้ติดต่อเดิม",
  emergencyContactPhone: "0898765432",
  occupation: "อาชีพเดิม",
  educationLevel: "ระดับเดิม",
};

describe("effective Hospital-scoped Patient profile values", () => {
  it("uses all legacy values only while the relationship has no local row", () => {
    expect(resolveEffectivePatientHospitalProfile({ legacy, local: null })).toEqual({
      values: legacy,
      source: "LEGACY_FALLBACK",
      version: 0,
    });
  });

  it("treats every local null as authoritative instead of falling back field-by-field", () => {
    expect(
      resolveEffectivePatientHospitalProfile({
        legacy,
        local: {
          gender: null,
          phoneNumber: null,
          addressText: "ที่อยู่เฉพาะโรงพยาบาล",
          emergencyContactName: null,
          emergencyContactPhone: null,
          occupation: null,
          educationLevel: null,
          version: 2,
        },
      }),
    ).toEqual({
      values: {
        gender: null,
        phoneNumber: null,
        addressText: "ที่อยู่เฉพาะโรงพยาบาล",
        emergencyContactName: null,
        emergencyContactPhone: null,
        occupation: null,
        educationLevel: null,
      },
      source: "HOSPITAL_LOCAL",
      version: 2,
    });
  });

  it("applies only submitted fields and preserves the rest of the effective values", () => {
    expect(applyPatientHospitalProfilePatch(legacy, { phoneNumber: null })).toEqual({
      ...legacy,
      phoneNumber: null,
    });
  });
});
