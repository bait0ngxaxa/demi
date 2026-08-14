import { describe, expect, it } from "vitest";

import { loginInputSchema } from "./login-schema";

describe("login input validation", () => {
  it("accepts a valid Thai National ID and bounded password", () => {
    const result = loginInputSchema.safeParse({
      nationalId: " 1000000000009 ",
      password: "correct horse battery staple",
    });

    expect(result.success).toBe(true);
    expect(result.data?.nationalId).toBe("1000000000009");
  });

  it("accepts a custom identifier used by the trusted first-admin bootstrap", () => {
    const result = loginInputSchema.safeParse({
      nationalId: "  DEMI-ADMIN-ROOT  ",
      password: "correct horse battery staple",
    });

    expect(result.success).toBe(true);
    expect(result.data?.nationalId).toBe("DEMI-ADMIN-ROOT");
  });

  it.each([
    { nationalId: "", password: "password" },
    { nationalId: " ", password: "password" },
    { nationalId: "1000000000009", password: "" },
  ])("rejects malformed login input", (input) => {
    expect(loginInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects oversized login input", () => {
    expect(
      loginInputSchema.safeParse({
        nationalId: "1".repeat(33),
        password: "p".repeat(129),
      }).success,
    ).toBe(false);
  });
});
