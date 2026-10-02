import { describe, expect, it } from "vitest";

import { loginInputSchema, loginFamilyInvitationReturnToSchema } from "./login-schema";

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


describe("bounded Family invitation login destination", () => {
  const token = "a".repeat(43);
  it("accepts only the existing fragment invitation destination", () => {
    expect(loginFamilyInvitationReturnToSchema.parse(`/app/family/invitations#${token}`)).toBe(`/app/family/invitations#${token}`);
  });
  it.each([
    "/app", "/app/family", `/app/patients#${token}`, `/app/family/invitations?token=${token}`,
    `/app/family/invitations/${token}`, `https://demi.example/app/family/invitations#${token}`,
    `/app/family/invitations#${token}extra`, "/app/family/invitations#short",
    `/app/family/invitations#${"!".repeat(43)}`, `/app/family/invitations#${token}\n`,
  ])("rejects unrelated or malformed destination %s", (destination) => {
    expect(loginFamilyInvitationReturnToSchema.safeParse(destination).success).toBe(false);
  });
});
