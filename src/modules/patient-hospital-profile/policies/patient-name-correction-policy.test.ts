import { describe, expect, it } from "vitest";

import { decidePatientNameCorrectionPolicy } from "./patient-name-correction-policy";

const hospitalA = "hospital-a";
const hospitalB = "hospital-b";

describe("E3 patient name correction policy", () => {
  it("allows the OWNER when every relationship of the Person is this Hospital", () => {
    expect(decidePatientNameCorrectionPolicy({
      isActivePlatformAdmin: false,
      isActiveOwnerOfPatientHospital: true,
      patientHospitalId: hospitalA,
      personHospitalIds: [hospitalA, hospitalA],
    })).toEqual({ allowed: true, basis: "HOSPITAL_OWNER_SINGLE_HOSPITAL" });
  });

  it("refuses the OWNER for a Person related to another Hospital, as Patient or as workforce", () => {
    expect(decidePatientNameCorrectionPolicy({
      isActivePlatformAdmin: false,
      isActiveOwnerOfPatientHospital: true,
      patientHospitalId: hospitalA,
      personHospitalIds: [hospitalA, hospitalB],
    })).toEqual({ allowed: false, reason: "multi_hospital_requires_admin" });
  });

  it("allows a platform ADMIN for a multi-hospital Person", () => {
    expect(decidePatientNameCorrectionPolicy({
      isActivePlatformAdmin: true,
      isActiveOwnerOfPatientHospital: false,
      patientHospitalId: hospitalA,
      personHospitalIds: [hospitalA, hospitalB],
    })).toEqual({ allowed: true, basis: "PLATFORM_ADMIN" });
  });

  it("denies everyone else, and fails closed without a known relationship", () => {
    expect(decidePatientNameCorrectionPolicy({
      isActivePlatformAdmin: false,
      isActiveOwnerOfPatientHospital: false,
      patientHospitalId: hospitalA,
      personHospitalIds: [hospitalA],
    })).toEqual({ allowed: false, reason: "not_authorized" });
    expect(decidePatientNameCorrectionPolicy({
      isActivePlatformAdmin: false,
      isActiveOwnerOfPatientHospital: true,
      patientHospitalId: hospitalA,
      personHospitalIds: [],
    }).allowed).toBe(false);
  });
});
