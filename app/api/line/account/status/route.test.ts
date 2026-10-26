import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ check: vi.fn(), origin: vi.fn(), body: vi.fn() }));
vi.mock("@/modules/line/services/line-account-status-service", async (original) => ({
  ...await original<typeof import("@/modules/line/services/line-account-status-service")>(), checkOwnLineAccountStatus: h.check,
}));
vi.mock("@/modules/line/transport/account-http", async (original) => ({
  ...await original<typeof import("@/modules/line/transport/account-http")>(), requireSameOrigin: h.origin, readAccountJson: h.body,
}));
import { LineAccountStatusRateLimited } from "@/modules/line/services/line-account-status-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";
import { POST, maxDuration } from "./route";

const tokens = { idToken: "temporary-id-token-value-00000", accessToken: "temporary-access-token-value-00000" };
const summary = { status: "LINKED", canUnlink: true, reachability: "FRIEND", menuState: "APPLIED", cleanupState: null };
const request = (): Request => new Request("https://demi.example.org/api/line/account/status", { method: "POST" });
beforeEach(() => { vi.resetAllMocks(); h.body.mockResolvedValue(tokens); h.check.mockResolvedValue({ ...summary, reconciliation: "CHECKED" }); });

describe("quota-controlled status HTTP boundary", () => {
  it("returns the verified outcome with private no-store headers", async () => {
    const response = await POST(request());
    expect(await response.json()).toEqual({ ...summary, reconciliation: "CHECKED" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(h.check).toHaveBeenCalledWith(tokens);
    expect(maxDuration).toBe(20);
  });
  it("preserves PENDING instead of treating request acceptance as completion", async () => {
    h.check.mockResolvedValue({ ...summary, reconciliation: "PENDING" });
    expect(await (await POST(request())).json()).toMatchObject({ reconciliation: "PENDING" });
  });
  it("returns safe 429 and Retry-After without identity data", async () => {
    h.check.mockRejectedValue(new LineAccountStatusRateLimited(147));
    const response = await POST(request());
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("147");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "ตรวจสอบสถานะบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" });
  });
  it.each(["userId", "bindingId", "lineUserId"])("rejects forged %s before service/quota/provider work", async (field) => {
    h.body.mockResolvedValue({ ...tokens, [field]: "forged" });
    expect((await POST(request())).status).toBe(400); expect(h.check).not.toHaveBeenCalled();
  });
  it("checks origin before reading credentials", async () => {
    h.origin.mockRejectedValue(new ForbiddenError());
    expect((await POST(request())).status).toBe(403); expect(h.body).not.toHaveBeenCalled(); expect(h.check).not.toHaveBeenCalled();
  });
  it.each([[new UnauthenticatedError(), 401], [new ForbiddenError(), 403], [new Error("private storage failure"), 503]] as const)("never turns auth/infrastructure failure into pending", async (error, status) => {
    h.check.mockRejectedValue(error); const response = await POST(request());
    expect(response.status).toBe(status); expect(await response.text()).not.toMatch(/private|PENDING/u);
  });
});
