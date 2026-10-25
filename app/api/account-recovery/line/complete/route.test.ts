import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  complete: vi.fn(),
  read: vi.fn(async () => ({ capabilityId: "11111111-1111-4111-8111-111111111111" })),
  sameOrigin: vi.fn(async () => undefined),
}));

vi.mock("@/modules/line/services/line-password-recovery-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/line/services/line-password-recovery-service")>();
  return { ...actual, completeLinePasswordRecoveryWithIdentityToken: h.complete };
});
vi.mock("@/modules/line/transport/account-http", () => ({ readAccountJson: h.read, requireSameOrigin: h.sameOrigin }));

import { LinePasswordRecoveryCompletionError } from "@/modules/line/services/line-password-recovery-service";
import { POST } from "./route";

describe("LINE recovery completion response", () => {
  beforeEach(() => {
    h.complete.mockReset().mockResolvedValue(undefined);
    h.read.mockResolvedValue({ capabilityId: "11111111-1111-4111-8111-111111111111" });
    h.sameOrigin.mockResolvedValue(undefined);
  });

  it("returns completion only after the service confirms finalization", async () => {
    const response = await POST(new Request("https://demi.example.org/api/account-recovery/line/complete", { method: "POST" }));
    await expect(response.json()).resolves.toEqual({ status: "COMPLETED" });
    expect(response.status).toBe(200);
  });

  it.each([
    ["PASSWORD_POLICY_REJECTED", "PASSWORD_POLICY_REJECTED"],
    ["LINK_UNAVAILABLE", "LINK_UNAVAILABLE"],
    ["LINE_PROOF_INVALID", "LINE_PROOF_INVALID"],
    ["RECONCILIATION_REQUIRED", "RECONCILIATION_REQUIRED"],
    ["OUTCOME_UNCERTAIN", "OUTCOME_UNCERTAIN"],
  ] as const)("exposes only the allowlisted %s result", async (code, expected) => {
    h.complete.mockRejectedValueOnce(new LinePasswordRecoveryCompletionError(code));
    const response = await POST(new Request("https://demi.example.org/api/account-recovery/line/complete", { method: "POST" }));
    await expect(response.json()).resolves.toEqual({ status: "ERROR", code: expected });
    expect(response.status).toBe(400);
  });

  it("does not expose unexpected provider details and marks an attempted completion uncertain", async () => {
    h.complete.mockRejectedValueOnce(new Error("private provider subject and secret token"));
    const response = await POST(new Request("https://demi.example.org/api/account-recovery/line/complete", { method: "POST" }));
    const body = await response.text();
    expect(body).toBe(JSON.stringify({ status: "ERROR", code: "OUTCOME_UNCERTAIN" }));
    expect(body).not.toContain("private provider");
  });

  it("classifies request-origin failures as unusable without invoking completion", async () => {
    h.sameOrigin.mockRejectedValueOnce(new Error("origin mismatch"));
    const response = await POST(new Request("https://demi.example.org/api/account-recovery/line/complete", { method: "POST" }));
    await expect(response.json()).resolves.toEqual({ status: "ERROR", code: "LINK_UNAVAILABLE" });
    expect(h.complete).not.toHaveBeenCalled();
  });
});
