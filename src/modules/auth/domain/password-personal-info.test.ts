import { describe, expect, it } from "vitest";

import {
  assertPasswordNotPersonal,
  birthDatePasswordFragments,
  passwordContainsPersonalInfo,
} from "./password-personal-info";
import { PasswordPolicyRejectedError } from "./password-policy";

const nationalId = "1101700203451";
const birthDate = new Date("1990-02-01T00:00:00.000Z");

describe("passwordContainsPersonalInfo (ADR-0030)", () => {
  it("finds a National ID typed in the same request, with or without separators", () => {
    const context = { nationalIds: [nationalId] };
    expect(passwordContainsPersonalInfo(`me${nationalId}`, context)).toBe(true);
    expect(passwordContainsPersonalInfo("1-1017-00203-45-1x", context)).toBe(true);
    expect(passwordContainsPersonalInfo("1101700203450x", context)).toBe(false);
  });

  it("compares every 13-digit window with a stored National ID hash", () => {
    const seen: string[] = [];
    const matchesNationalId = (candidate: string): boolean => {
      seen.push(candidate);
      return candidate === nationalId;
    };
    expect(passwordContainsPersonalInfo(`9${nationalId}9`, { matchesNationalId })).toBe(true);
    expect(seen).toContain(nationalId);
    expect(passwordContainsPersonalInfo("riverstone12345", { matchesNationalId: () => true })).toBe(false);
  });

  it("finds the phone number by digits, including a +66 record", () => {
    expect(passwordContainsPersonalInfo("call0812345678", { phoneNumbers: ["081-234-5678"] })).toBe(true);
    expect(passwordContainsPersonalInfo("call0812345678", { phoneNumbers: ["+66 81 234 5678"] })).toBe(true);
    expect(passwordContainsPersonalInfo("home021234567", { phoneNumbers: ["02-123-4567"] })).toBe(true);
    expect(passwordContainsPersonalInfo("call08123456", { phoneNumbers: ["081-234-5678"] })).toBe(false);
    expect(passwordContainsPersonalInfo("anything1234", { phoneNumbers: ["1234", null] })).toBe(false);
  });

  it("finds an HN case-insensitively and ignores HNs shorter than 4 characters", () => {
    expect(passwordContainsPersonalInfo("myhn12345x", { hospitalNumbers: ["HN-12345"] })).toBe(true);
    expect(passwordContainsPersonalInfo("ward6789sky", { hospitalNumbers: ["6789"] })).toBe(true);
    expect(passwordContainsPersonalInfo("room123blue", { hospitalNumbers: ["123"] })).toBe(false);
  });

  it("builds ddmmyyyy, yyyymmdd and ddmmyy in Gregorian and Buddhist years", () => {
    expect(birthDatePasswordFragments(birthDate)).toEqual([
      "01021990", "19900201", "010290",
      "01022533", "25330201", "010233",
    ]);
  });

  it.each(["01021990", "19900201", "010290", "01022533", "25330201", "010233", "01/02/1990", "01-02-2533", "๐๑๐๒๒๕๓๓"])(
    "finds the birthdate written as %s",
    (fragment) => {
      expect(passwordContainsPersonalInfo(`sky${fragment}`, { birthDates: [birthDate] })).toBe(true);
    },
  );

  it("does not join digits across letters", () => {
    expect(passwordContainsPersonalInfo("a01b02c90d", { birthDates: [birthDate] })).toBe(false);
  });

  it("accepts a password with none of the person's data", () => {
    expect(passwordContainsPersonalInfo("lanternfig", {
      nationalIds: [nationalId],
      phoneNumbers: ["0812345678"],
      hospitalNumbers: ["HN-12345"],
      birthDates: [birthDate, null],
    })).toBe(false);
  });

  it("throws the reasoned policy error", () => {
    expect(() => assertPasswordNotPersonal(`x${nationalId}`, { nationalIds: [nationalId] }))
      .toThrow(expect.objectContaining({ name: "PasswordPolicyRejectedError", reason: "PASSWORD_PERSONAL_INFO" }));
    expect(() => assertPasswordNotPersonal("lanternfig", { nationalIds: [nationalId] })).not.toThrow();
    try {
      assertPasswordNotPersonal(`x${nationalId}`, { nationalIds: [nationalId] });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(PasswordPolicyRejectedError);
    }
  });
});
