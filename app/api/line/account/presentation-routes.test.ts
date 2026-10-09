import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  link: vi.fn(),
  unlink: vi.fn(),
  refresh: vi.fn(),
  summary: vi.fn(),
  schedule: vi.fn(),
  requireSameOrigin: vi.fn(),
  readAccountJson: vi.fn(),
  lineErrorResponse: vi.fn(),
  readiness: vi.fn(),
}));

vi.mock("@/modules/line/services/line-account-service", () => ({
  linkLineAccount: mocks.link,
  unlinkLineAccount: mocks.unlink,
  refreshLineAccountReachability: mocks.refresh,
  getLineAccountSummary: mocks.summary,
}));
vi.mock("@/modules/line/transport/line-reconciliation-scheduler", () => ({
  scheduleLineBindingReconciliation: mocks.schedule,
}));
vi.mock("@/modules/line/services/line-disconnection-configuration", () => ({
  requireLineDisconnectionReadiness: mocks.readiness,
}));
vi.mock("@/modules/line/transport/account-http", () => ({
  requireSameOrigin: mocks.requireSameOrigin,
  readAccountJson: mocks.readAccountJson,
  lineErrorResponse: mocks.lineErrorResponse,
}));

import { POST as linkPOST } from "./link/route";
import { POST as unlinkPOST } from "./unlink/route";
import { POST as reachabilityPOST } from "./reachability/route";

const intent = {
  intentId: "82ce5f58-4a66-4b03-a5e8-2418e8544271",
  challenge: "secure-256-bit-challenge-for-route-tests-000000000000000000",
};

describe("LINE account mutation response boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSameOrigin.mockResolvedValue(undefined);
    mocks.lineErrorResponse.mockReturnValue(Response.json({ error: "safe" }, { status: 503 }));
    mocks.readiness.mockResolvedValue(null);
  });

  it("refreshes friendship then schedules presentation without exposing binding IDs or tokens", async () => {
    const tokens = { idToken: "temporary-id-token-value-00000", accessToken: "temporary-access-token-value-00000" };
    mocks.readAccountJson.mockResolvedValue(tokens);
    mocks.refresh.mockResolvedValue({ bindingId: "opaque-binding" });
    const summary = { status: "UNLINKED", canUnlink: false, reachability: "FRIEND", menuState: null, cleanupState: "PENDING" };
    mocks.summary.mockResolvedValue(summary);
    const response = await reachabilityPOST(new Request("https://demi.example.org/api/line/account/reachability", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
    expect(mocks.refresh).toHaveBeenCalledWith(tokens);
    expect(mocks.schedule).toHaveBeenCalledWith(["opaque-binding"]);
  });

  it("rejects client identity fields and does not schedule a failed refresh", async () => {
    mocks.readAccountJson.mockResolvedValue({ idToken: "temporary-id-token-value-00000", accessToken: "temporary-access-token-value-00000", lineUserId: "forged" });
    expect((await reachabilityPOST(new Request("https://demi.example.org/api/line/account/reachability", { method: "POST" }))).status).toBe(400);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("fails safely on origin/session/provider errors without scheduling", async () => {
    mocks.readAccountJson.mockResolvedValue({ idToken: "temporary-id-token-value-00000", accessToken: "temporary-access-token-value-00000" });
    mocks.refresh.mockRejectedValue(new Error("private provider failure"));
    const response = await reachabilityPOST(new Request("https://demi.example.org/api/line/account/reachability", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("checks exact same origin before processing refresh credentials", async () => {
    mocks.requireSameOrigin.mockRejectedValueOnce(new Error("wrong origin"));
    await reachabilityPOST(new Request("https://demi.example.org/api/line/account/reachability", { method: "POST" }));
    expect(mocks.readAccountJson).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("returns linked with an unknown presentation state after scheduling reconcile", async () => {
    mocks.readAccountJson.mockResolvedValue({ ...intent, idToken: "verified-token-value-with-sufficient-length" });
    mocks.link.mockResolvedValue({ status: "LINKED", bindingId: "binding-id", lifecycleVersion: 2 });

    const response = await linkPOST(new Request("https://demi.example.org/api/line/account/link", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "LINKED", presentation: "UNKNOWN" });
    expect(mocks.link.mock.invocationCallOrder[0]).toBeLessThan(mocks.schedule.mock.invocationCallOrder[0]);
    expect(mocks.schedule).toHaveBeenCalledWith(["binding-id"]);
  });

  it("returns authoritative unlink with pending cleanup after scheduling reconcile", async () => {
    mocks.readAccountJson.mockResolvedValue(intent);
    mocks.unlink.mockResolvedValue({ status: "UNLINKED", bindingId: "binding-id", lifecycleVersion: 3 });

    const response = await unlinkPOST(new Request("https://demi.example.org/api/line/account/unlink", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "UNLINKED", cleanup: "PENDING" });
    expect(mocks.unlink.mock.invocationCallOrder[0]).toBeLessThan(mocks.schedule.mock.invocationCallOrder[0]);
    expect(mocks.schedule).toHaveBeenCalledWith(["binding-id"]);
  });

  it("keeps local Unlink available and records the readiness fallback when configuration fails", async () => {
    mocks.readAccountJson.mockResolvedValue(intent);
    mocks.readiness.mockRejectedValue(new Error("reviewed configuration unavailable"));
    mocks.unlink.mockResolvedValue({ status: "UNLINKED", bindingId: "binding-id", lifecycleVersion: 3 });

    const response = await unlinkPOST(new Request("https://demi.example.org/api/line/account/unlink", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.unlink).toHaveBeenCalledWith(intent, { disconnectionReadinessUnavailable: true });
    expect(mocks.schedule).toHaveBeenCalledWith(["binding-id"]);
  });
});
