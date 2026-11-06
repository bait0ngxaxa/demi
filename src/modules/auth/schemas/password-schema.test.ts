import { describe, expect, it } from "vitest";

import { passwordPolicyIssueFrom, PASSWORD_MAX_BYTES, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../domain/password-policy";
import { passwordLength } from "../domain/password-policy";
import { userOwnedPasswordSchema } from "./password-schema";

function issueOf(value: unknown): string | null {
  const result = userOwnedPasswordSchema.safeParse(value);
  if (result.success) return null;
  return passwordPolicyIssueFrom(result.error.issues.map((issue) => ({ ...issue, path: ["password"] })), ["password"]) ??
    "OTHER";
}

describe("userOwnedPasswordSchema (ADR-0030)", () => {
  it("uses the 8–128 code point constants", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
    expect(PASSWORD_MAX_BYTES).toBe(72);
  });

  it("rejects 7 characters and accepts 8", () => {
    expect(issueOf("kqzmvtr")).toBe("PASSWORD_TOO_SHORT");
    expect(issueOf("kqzmvtrw")).toBeNull();
  });

  it("measures the 128 / 129 code point bound before the provider's byte limit", () => {
    const thai128 = "ก".repeat(128);
    expect(passwordLength(thai128)).toBe(128);
    // 128 code points is inside the length rule; only the 72-byte provider limit then applies.
    expect(issueOf(thai128)).toBe("PASSWORD_TOO_MANY_BYTES");
    expect(issueOf("ก".repeat(129))).toBe("PASSWORD_TOO_LONG");
    expect(issueOf("x".repeat(129))).toBe("PASSWORD_TOO_LONG");
  });

  it("accepts up to 72 UTF-8 bytes and rejects 73", () => {
    expect(issueOf(`${"kqzmvtrw".repeat(9)}`)).toBeNull();
    expect(issueOf(`${"kqzmvtrw".repeat(9)}z`)).toBe("PASSWORD_TOO_MANY_BYTES");
    expect(issueOf("ฟ้าใสวันนี้ดีจังเลยนะคะเพื่อน")).toBe("PASSWORD_TOO_MANY_BYTES");
    expect(issueOf("ฟ้าใสวันนี้ดีจังเลย")).toBeNull();
  });

  it("counts Thai combining marks as characters (code points, not graphemes)", () => {
    // ท ี ่ น ี ่ น ะ: 8 code points, only 4 visible clusters.
    expect(passwordLength("ที่นี่นะ")).toBe(8);
    expect(issueOf("ที่นี่นะ")).toBeNull();
    expect(issueOf("ที่นี่น")).toBe("PASSWORD_TOO_SHORT");
  });

  it("allows spaces and emoji and never trims", () => {
    expect(issueOf("my cat naps")).toBeNull();
    expect(issueOf(" qzmvtrw")).toBeNull();
    expect(issueOf("🌧️🌈 ฝนตก")).toBeNull();
    // 7 code points although the UTF-16 length is 13.
    expect(issueOf("a🙂🙂🙂🙂🙂🙂")).toBe("PASSWORD_TOO_SHORT");
  });

  it("has no composition rule", () => {
    expect(issueOf("horsebatterystaple")).toBeNull();
    expect(issueOf("lanternfig")).toBeNull();
    expect(issueOf("90417263")).toBeNull();
    expect(issueOf("แมวส้มนอนกลางวัน")).toBeNull();
  });

  it("rejects blocklisted passwords case-insensitively", () => {
    for (const value of ["password", "PassWord", "iloveyou", "Sunshine", "QWERTYUIOP", "1q2w3e4r"]) {
      expect(issueOf(value), value).toBe("PASSWORD_BLOCKLISTED");
    }
  });

  it("rejects generated runs, repeats and product words with digits", () => {
    for (const value of [
      "aaaaaaaa", "11111111", "ฮฮฮฮฮฮฮฮ", "12121212", "abcdabcd",
      "12345678", "87654321", "34567890", "09876543", "abcdefgh", "ZYXWVUTS",
      "qwertyui", "asdfghjk", "lkjhgfds", "poiuytre",
      "password2026", "demi1234", "Admin2026", "demidemi",
    ]) {
      expect(issueOf(value), value).toBe("PASSWORD_BLOCKLISTED");
    }
  });

  it("rejects a non-string value", () => {
    expect(issueOf(12345678)).toBe("OTHER");
  });
});
