import { describe, expect, it } from "vitest";

import {
  PASSWORD_BLOCKLISTED_MESSAGE,
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_PERSONAL_INFO_MESSAGE,
  PASSWORD_POLICY_HINT,
  passwordIssueMessage,
  passwordPolicyMessage,
} from "./password-policy-copy";
import {
  passwordLengthIssue,
  passwordPolicyIssueFrom,
  PasswordPolicyRejectedError,
  throwIfPasswordPolicyIssue,
} from "./password-policy";
import { COMMON_PASSWORDS } from "./data/common-passwords";

describe("password policy", () => {
  it("checks length only, for client bundles", () => {
    expect(passwordLengthIssue("short")).toBe("PASSWORD_TOO_SHORT");
    expect(passwordLengthIssue("password")).toBeNull();
  });

  it("reads policy issues from the named fields only", () => {
    const issues = [
      { path: ["passwordConfirmation"], message: "PASSWORD_BLOCKLISTED" },
      { path: ["password"], message: "Invalid input" },
      { path: ["password"], message: "PASSWORD_TOO_SHORT" },
    ];
    expect(passwordPolicyIssueFrom(issues, ["password"])).toBe("PASSWORD_TOO_SHORT");
    expect(passwordPolicyIssueFrom(issues, ["newPassword"])).toBeNull();
    expect(() => throwIfPasswordPolicyIssue(issues, ["password"])).toThrow(PasswordPolicyRejectedError);
    expect(() => throwIfPasswordPolicyIssue(issues, ["newPassword"])).not.toThrow();
  });

  it("is a validation error so existing generic handling still fails closed", () => {
    const error = new PasswordPolicyRejectedError("PASSWORD_BLOCKLISTED");
    expect(error.code).toBe("VALIDATION");
    expect(error.reason).toBe("PASSWORD_BLOCKLISTED");
  });

  it("tells the person why, in Thai", () => {
    expect(PASSWORD_POLICY_HINT).toBe(
      "รหัสผ่านอย่างน้อย 8 ตัวอักษร ใช้ตัวอักษร ตัวเลข หรือภาษาไทยก็ได้ ไม่ต้องมีอักขระพิเศษ แนะนำให้ใช้วลีที่จำง่ายแต่เดายาก",
    );
    expect(passwordPolicyMessage("PASSWORD_TOO_SHORT")).toBe("รหัสผ่านต้องมีความยาว 8–128 ตัวอักษร");
    expect(passwordPolicyMessage("PASSWORD_TOO_LONG")).toBe(PASSWORD_LENGTH_MESSAGE);
    expect(passwordPolicyMessage("PASSWORD_BLOCKLISTED")).toBe(PASSWORD_BLOCKLISTED_MESSAGE);
    expect(passwordPolicyMessage("PASSWORD_PERSONAL_INFO")).toBe(PASSWORD_PERSONAL_INFO_MESSAGE);
    expect(passwordPolicyMessage("PASSWORD_TOO_MANY_BYTES")).toContain("24");
    expect(passwordIssueMessage({ message: "PASSWORD_BLOCKLISTED" })).toBe(PASSWORD_BLOCKLISTED_MESSAGE);
    expect(passwordIssueMessage({ message: "Invalid input" })).toBe(PASSWORD_LENGTH_MESSAGE);
  });

  it("bundles a lower-cased common-password list of policy-length entries", () => {
    expect(COMMON_PASSWORDS.length).toBeGreaterThan(3000);
    expect(COMMON_PASSWORDS.every((entry) => entry === entry.toLowerCase() && [...entry].length >= 8)).toBe(true);
    expect(new Set(COMMON_PASSWORDS).size).toBe(COMMON_PASSWORDS.length);
  });
});
