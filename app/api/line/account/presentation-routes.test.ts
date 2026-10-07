import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  link: vi.fn(),
  unlink: vi.fn(),
  schedule: vi.fn(),
  requireSameOrigin: vi.fn(),
  readAccountJson: vi.fn(),
  lineErrorResponse: vi.fn(),
}));

vi.mock("@/modules/line/services/line-account-service", () => ({
  linkLineAccount: mocks.link,
  unlinkLineAccount: mocks.unlink,
}));
vi.mock("@/modules/line/transport/line-reconciliation-scheduler", () => ({
  scheduleLineBindingReconciliation: mocks.schedule,
}));
vi.mock("@/modules/line/transport/account-http", () => ({
  requireSameOrigin: mocks.requireSameOrigin,
  readAccountJson: mocks.readAccountJson,
  lineErrorResponse: mocks.lineErrorResponse,
}));

import { POST as linkPOST } from "./link/route";
import { POST as unlinkPOST } from "./unlink/route";

const intent = {
  intentId: "82ce5f58-4a66-4b03-a5e8-2418e8544271",
  challenge: "secure-256-bit-challenge-for-route-tests-000000000000000000",
};

describe("LINE account mutation response boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSameOrigin.mockResolvedValue(undefined);
    mocks.lineErrorResponse.mockReturnValue(Response.json({ error: "safe" }, { status: 503 }));
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
});
