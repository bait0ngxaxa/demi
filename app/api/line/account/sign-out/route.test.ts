import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({ origin: vi.fn(), signOut: vi.fn(), unlink: vi.fn() }));
vi.mock("@/modules/auth/services/authentication-service", () => ({ signOutCurrentSession: mocks.signOut }));
vi.mock("@/modules/line/services/line-account-service", () => ({ unlinkLineAccount: mocks.unlink }));
vi.mock("@/modules/line/transport/account-http", () => ({
  requireSameOrigin: mocks.origin,
  lineErrorResponse: () => Response.json({ error: "ไม่สามารถดำเนินการนี้ได้" }, { status: 403, headers: { "cache-control": "private, no-store" } }),
}));
import { POST } from "./route";

const request = (): Request => new Request("https://demi.example.org/api/line/account/sign-out", { method: "POST" });

describe("DEMI sign-out after LINE Disconnection", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.origin.mockResolvedValue(undefined); mocks.signOut.mockResolvedValue(undefined);
  });

  it("ends only the DEMI session and returns the fixed LINE login return path", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "SIGNED_OUT", redirectTo: "/login?returnTo=%2Fline%2Faccount" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.signOut).toHaveBeenCalledOnce(); expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("is safe to retry: repeated calls never unlink and stay successful", async () => {
    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(200);
    expect(mocks.signOut).toHaveBeenCalledTimes(2); expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("reports a failed session invalidation without claiming sign-out", async () => {
    mocks.signOut.mockRejectedValue(new Error("Authentication session could not be invalidated"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    const body = await response.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty("redirectTo"); expect(JSON.stringify(body)).not.toContain("invalidated");
  });

  it("rejects a cross-origin request before touching the session", async () => {
    mocks.origin.mockRejectedValue(new ForbiddenError());
    expect((await POST(request())).status).toBe(403);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
