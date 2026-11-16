import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ refresh: vi.fn(), origin: vi.fn(), body: vi.fn() }));
vi.mock("@/modules/line/services/line-account-service", async (original) => ({
  ...await original<typeof import("@/modules/line/services/line-account-service")>(), refreshLineAccountReachabilityIfStale: h.refresh,
}));
vi.mock("@/modules/line/transport/account-http", async (original) => ({
  ...await original<typeof import("@/modules/line/transport/account-http")>(), requireSameOrigin: h.origin, readAccountJson: h.body,
}));
import { LineFailure } from "@/modules/line/domain/line-errors";
import { ForbiddenError } from "@/shared/errors/application-error";
import { POST } from "./route";

const tokens = { idToken: "temporary-id-token-value-00000", accessToken: "temporary-access-token-value-00000" };
const request = (): Request => new Request("https://demi.example.org/api/line/account/reachability/refresh", { method: "POST" });
beforeEach(() => { vi.resetAllMocks(); h.body.mockResolvedValue(tokens); h.refresh.mockResolvedValue("REFRESHED"); });

describe("background LINE reachability refresh HTTP boundary", () => {
  it.each(["REFRESHED", "FRESH", "NO_BINDING"] as const)("returns only the %s status with private no-store headers", async (status) => {
    h.refresh.mockResolvedValue(status);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(h.refresh).toHaveBeenCalledWith(tokens);
  });

  it("rejects a cross-origin request before reading credentials", async () => {
    h.origin.mockRejectedValue(new ForbiddenError());
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(h.body).not.toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("answers 401 for a signed-out user", async () => {
    h.refresh.mockResolvedValue("SIGNED_OUT");
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "กรุณาเข้าสู่ระบบ DEMI ก่อน" });
  });

  it.each([{ idToken: "short" }, { ...tokens, userId: "forged" }, { ...tokens, bindingId: "forged" }])("rejects an invalid body %# before service work", async (body) => {
    h.body.mockResolvedValue(body);
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("maps the refresh rate limit to 429 and infrastructure failures to a safe 503", async () => {
    h.refresh.mockRejectedValueOnce(new LineFailure("LINE_RATE_LIMITED"));
    expect((await POST(request())).status).toBe(429);
    h.refresh.mockRejectedValueOnce(new Error("private storage failure"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/private/u);
  });
});
