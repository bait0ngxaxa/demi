import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({ origin: vi.fn(), read: vi.fn(), signOut: vi.fn(), completion: vi.fn(), unlink: vi.fn() }));
vi.mock("@/modules/auth/services/authentication-service", () => ({ signOutCurrentSession: mocks.signOut }));
vi.mock("@/modules/line/services/line-account-service", () => ({ verifyLineUnlinkCompletion: mocks.completion, unlinkLineAccount: mocks.unlink }));
vi.mock("@/modules/line/transport/account-http", () => ({
  requireSameOrigin: mocks.origin, readAccountJson: mocks.read,
  lineErrorResponse: () => Response.json({ error: "ไม่สามารถดำเนินการนี้ได้" }, { status: 403, headers: { "cache-control": "private, no-store" } }),
}));
import { POST } from "./route";

const proof = { intentId: "c1111111-1111-4111-a111-111111111111", challenge: "u".repeat(43) };
const request = (): Request => new Request("https://demi.example.org/api/line/account/sign-out", { method: "POST" });

describe("DEMI sign-out after LINE Disconnection", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.origin.mockResolvedValue(undefined); mocks.read.mockResolvedValue(proof);
    mocks.completion.mockResolvedValue("COMMITTED"); mocks.signOut.mockResolvedValue(undefined);
  });

  it("ends the session only after the server proves this session's UNLINK committed", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "SIGNED_OUT", redirectTo: "/login?returnTo=%2Fline%2Faccount" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.completion).toHaveBeenCalledWith(proof);
    expect(mocks.signOut).toHaveBeenCalledOnce(); expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("never signs out a different User or session that replaced the disconnecting one", async () => {
    mocks.completion.mockResolvedValue("SESSION_CHANGED");
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "SESSION_CHANGED" });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it.each(["NOT_COMMITTED", "PROOF_EXPIRED"] as const)("keeps the session for %s and reports that exact cause", async (completion) => {
    mocks.completion.mockResolvedValue(completion);
    const response = await POST(request());
    expect(response.status).toBe(409);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ code: completion }); expect(body).not.toHaveProperty("status");
    expect(mocks.signOut).not.toHaveBeenCalled(); expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it.each([
    ["missing proof", {}],
    ["client-supplied identity", { ...proof, userId: "83da3ab8-2895-4cab-bb63-19f807246288" }],
  ])("rejects %s before touching the session", async (_label, body) => {
    mocks.read.mockResolvedValue(body);
    expect((await POST(request())).status).toBe(400);
    expect(mocks.completion).not.toHaveBeenCalled(); expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("rejects unmatched or stale proof and a cross-origin request without signing out", async () => {
    mocks.completion.mockRejectedValue(new ForbiddenError());
    expect((await POST(request())).status).toBe(403);
    mocks.origin.mockRejectedValue(new ForbiddenError());
    expect((await POST(request())).status).toBe(403);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("reports a missing session as SESSION_ABSENT, never as signed out after a committed unlink", async () => {
    mocks.completion.mockRejectedValue(new UnauthenticatedError());
    const response = await POST(request());
    expect(response.status).toBe(401);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ code: "SESSION_ABSENT", redirectTo: "/login?returnTo=%2Fline%2Faccount" });
    expect(body).not.toHaveProperty("status");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("reports a failed session invalidation without claiming sign-out", async () => {
    mocks.signOut.mockRejectedValue(new Error("Authentication session could not be invalidated"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    const body = await response.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty("redirectTo"); expect(JSON.stringify(body)).not.toContain("invalidated");
  });
});
