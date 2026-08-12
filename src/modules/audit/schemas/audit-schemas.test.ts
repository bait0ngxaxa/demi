import { describe, expect, it } from "vitest";

import { auditEventInputSchema, auditMetadataSchema } from "./audit-schemas";

describe("audit input boundary", () => {
  it("accepts bounded non-sensitive metadata", () => {
    const result = auditMetadataSchema.safeParse({
      source: "hospital-owner",
      attempt: 1,
      redacted: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects credentials and sensitive identity values", () => {
    expect(auditMetadataSchema.safeParse({ token: "secret" }).success).toBe(false);
    expect(auditMetadataSchema.safeParse({ national_id: "sensitive" }).success).toBe(false);
  });

  it("requires an explicit actor, action, and resource", () => {
    expect(
      auditEventInputSchema.safeParse({
        actorUserId: null,
        action: "hospital.approved",
        resourceType: "Hospital",
      }).success,
    ).toBe(true);

    expect(
      auditEventInputSchema.safeParse({
        actorUserId: null,
        action: "",
        resourceType: "Hospital",
      }).success,
    ).toBe(false);
  });
});
