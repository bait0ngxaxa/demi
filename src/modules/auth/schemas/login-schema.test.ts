import { describe, expect, it } from "vitest";

import { loginInputSchema } from "./login-schema";

describe("login input validation", () => {
  it("accepts a bounded email and password", () => {
    const result = loginInputSchema.safeParse({
      email: " user@example.com ",
      password: "correct horse battery staple",
    });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("user@example.com");
  });

  it.each([
    { email: "not-an-email", password: "password" },
    { email: "", password: "password" },
    { email: "user@example.com", password: "" },
  ])("rejects malformed login input", (input) => {
    expect(loginInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects oversized login input", () => {
    expect(
      loginInputSchema.safeParse({
        email: `${"a".repeat(245)}@example.com`,
        password: "p".repeat(129),
      }).success,
    ).toBe(false);
  });
});
