import { describe, expect, it } from "vitest";

import { lineIntentUseSchema, lineLinkRequestSchema, lineWebhookEventSchema } from "./line-schemas";

describe("LINE input schemas", () => {
  it("rejects client supplied LINE identity, role, resource and scope fields at the Link boundary", () => {
    const input = {
      intentId: "82ce5f58-4a66-4b03-a5e8-2418e8544271",
      challenge: "secure-256-bit-challenge-for-tests-000000000000000000000",
      idToken: "raw-line-id-token-value-at-least-20-characters",
      lineUserId: `U${"a".repeat(32)}`,
      userId: "83da3ab8-2895-4cab-bb63-19f807246288",
      role: "ADMIN",
      presentationRole: "HOSPITAL",
      hospitalId: "11111111-1111-4111-8111-111111111111",
      patientId: "22222222-2222-4222-8222-222222222222",
      resourcePath: "/app/patients/22222222-2222-4222-8222-222222222222",
    };
    expect(lineLinkRequestSchema.safeParse(input).success).toBe(false);
    const trustedShape = {
      intentId: "82ce5f58-4a66-4b03-a5e8-2418e8544271",
      challenge: "secure-256-bit-challenge-for-tests-000000000000000000000",
      idToken: "raw-line-id-token-value-at-least-20-characters",
    };
    expect(lineLinkRequestSchema.parse(trustedShape)).toEqual(trustedShape);
    const unlink = lineIntentUseSchema.parse({
      intentId: trustedShape.intentId,
      challenge: trustedShape.challenge,
      presentationRole: "OSM",
      hospitalId: "untrusted-resource",
    });
    expect(unlink).toEqual({ intentId: trustedShape.intentId, challenge: trustedShape.challenge });
  });

  it("accepts future additive webhook fields while validating consumed event identifiers", () => {
    const event = lineWebhookEventSchema.parse({
      type: "future_event",
      webhookEventId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      timestamp: 1_791_254_400_000,
      futureField: { preserveCompatibility: true },
    });
    expect(event.type).toBe("future_event");
    expect(() => lineWebhookEventSchema.parse({
      type: "follow",
      webhookEventId: "IIIIIIIIIIIIIIIIIIIIIIIIII",
      timestamp: 1_791_254_400_000,
    })).toThrow();
  });
});
