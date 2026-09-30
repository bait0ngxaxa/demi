import { describe, expect, it } from "vitest";

import { patientHospitalProfileUpdateSchema } from "./patient-hospital-profile-schemas";

describe("Patient Hospital profile update schema", () => {
  it("accepts only the approved bounded general fields and converts blank values to clear", () => {
    expect(
      patientHospitalProfileUpdateSchema.parse({
        expectedVersion: "0",
        gender: "  ระบุเอง  ",
        phoneNumber: "",
        addressText: "ที่อยู่ติดต่อปัจจุบัน",
        emergencyContactName: null,
        emergencyContactPhone: "0812345678",
        occupation: "เกษตรกร",
        educationLevel: "มัธยมศึกษา",
      }),
    ).toEqual({
      expectedVersion: 0,
      gender: "ระบุเอง",
      phoneNumber: null,
      addressText: "ที่อยู่ติดต่อปัจจุบัน",
      emergencyContactName: null,
      emergencyContactPhone: "0812345678",
      occupation: "เกษตรกร",
      educationLevel: "มัธยมศึกษา",
    });
  });

  it.each([
    "givenName",
    "familyName",
    "dateOfBirth",
    "nationalId",
    "identityKeyHash",
    "hospitalNumber",
    "roles",
    "personId",
    "patientProfileId",
    "hospitalId",
    "arbitrary",
  ])("rejects the non-editable or unknown field %s", (field) => {
    expect(
      patientHospitalProfileUpdateSchema.safeParse({
        expectedVersion: 0,
        gender: "ชาย",
        [field]: "not accepted",
      }).success,
    ).toBe(false);
  });

  it("rejects unbounded values, missing changes, and invalid versions", () => {
    expect(
      patientHospitalProfileUpdateSchema.safeParse({
        expectedVersion: 0,
        addressText: "x".repeat(501),
      }).success,
    ).toBe(false);
    expect(patientHospitalProfileUpdateSchema.safeParse({ expectedVersion: 0 }).success).toBe(
      false,
    );
    expect(
      patientHospitalProfileUpdateSchema.safeParse({
        expectedVersion: "-1",
        gender: "ชาย",
      }).success,
    ).toBe(false);
    expect(
      patientHospitalProfileUpdateSchema.safeParse({
        expectedVersion: "9999999999999999",
        gender: "ชาย",
      }).success,
    ).toBe(false);
  });
});
