import { describe, expect, it } from "vitest";

import { InfrastructureError } from "@/shared/errors/application-error";

import { createProviderLoginAlias } from "./provider-login-alias";

describe("provider login alias", () => {
  it("derives a stable opaque alias from the DEMI User ID", () => {
    const alias = createProviderLoginAlias("11111111-1111-4111-8111-111111111111");

    expect(alias).toBe("11111111-1111-4111-8111-111111111111@auth.demi.internal");
    expect(alias).not.toContain("1000000000009");
  });

  it("fails closed for an invalid internal User ID", () => {
    expect(() => createProviderLoginAlias("not-a-user-id")).toThrow(InfrastructureError);
  });
});
