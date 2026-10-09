import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ready: vi.fn(), create: vi.fn(), origin: vi.fn(), read: vi.fn() }));
vi.mock("@/modules/line/services/line-disconnection-configuration", () => ({ requireLineDisconnectionReadiness: mocks.ready }));
vi.mock("@/modules/line/services/line-account-service", () => ({ createLineAccountIntent: mocks.create }));
vi.mock("@/modules/line/transport/account-http", () => ({
  requireSameOrigin: mocks.origin, readAccountJson: mocks.read,
  lineErrorResponse: () => Response.json({ error: "บริการ LINE ยังไม่ได้ตั้งค่า" }, { status: 503, headers: { "cache-control": "private, no-store" } }),
}));
import { POST } from "./route";

describe("Account intent readiness boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.origin.mockResolvedValue(undefined);
    mocks.ready.mockRejectedValue(new Error("unavailable inventory"));
    mocks.create.mockResolvedValue({ intentId: "opaque-intent", challenge: "temporary-challenge" });
  });
  it("allows authenticated service preparation of local unlink despite inventory loss", async () => {
    mocks.read.mockResolvedValue({ action: "UNLINK" });
    const response = await POST(new Request("https://demi.example.org/api/line/account/intents", { method: "POST" }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith("UNLINK", { enforceRelinkPolicy: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("never waives Link restrictions when enabled readiness is lost", async () => {
    mocks.read.mockResolvedValue({ action: "LINK" });
    expect((await POST(new Request("https://demi.example.org/api/line/account/intents", { method: "POST" }))).status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
