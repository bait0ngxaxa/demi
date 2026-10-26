import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ refresh: vi.fn(), summary: vi.fn(), reconcile: vi.fn(), origin: vi.fn(), body: vi.fn() }));
vi.mock("@/modules/line/services/line-account-service", () => ({ refreshLineAccountReachability: h.refresh, getLineAccountSummary: h.summary }));
vi.mock("@/modules/line/services/line-menu-reconciler", () => ({ reconcileLineBinding: h.reconcile }));
vi.mock("@/modules/line/transport/account-http", () => ({
  requireSameOrigin: h.origin, readAccountJson: h.body,
  lineErrorResponse: () => Response.json({ error: "ตรวจสอบไม่สำเร็จ" }, { status: 503 }),
}));
import { POST } from "./route";

const tokens = { idToken: "temporary-id-token-value-00000", accessToken: "temporary-access-token-value-00000" };
const summary = { status: "LINKED", canUnlink: true, reachability: "FRIEND", menuState: "APPLIED", cleanupState: null };
const request = (): Request => new Request("https://demi.example.org/api/line/account/status", { method: "POST" });

beforeEach(() => {
  vi.resetAllMocks(); h.body.mockResolvedValue(tokens); h.refresh.mockResolvedValue({ bindingId: "server-owned-binding" });
  h.summary.mockResolvedValue(summary); h.reconcile.mockResolvedValue("RECONCILED");
});

describe("explicit authorized menu status check", () => {
  it("awaits reconciliation before reading persisted summary and never exposes its binding locator", async () => {
    let finish: ((value: string) => void) | undefined;
    h.reconcile.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const result = POST(request());
    await vi.waitFor(() => expect(h.reconcile).toHaveBeenCalledOnce());
    expect(h.summary).not.toHaveBeenCalled();
    finish?.("RECONCILED");
    const response = await result;
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ...summary, reconciliation: "CHECKED" });
    expect(h.refresh).toHaveBeenCalledWith(tokens);
    expect(h.reconcile).toHaveBeenCalledWith("server-owned-binding");
  });
  it.each(["BUSY", "MISSING"])("reports %s as pending without retrying", async (outcome) => {
    h.reconcile.mockResolvedValue(outcome);
    expect(await (await POST(request())).json()).toEqual({ ...summary, reconciliation: "PENDING" });
    expect(h.reconcile).toHaveBeenCalledOnce();
  });
  it.each(["UNKNOWN", "MISMATCH", "UNAVAILABLE"])("does not turn checked %s into applied", async (menuState) => {
    h.summary.mockResolvedValue({ ...summary, menuState });
    expect(await (await POST(request())).json()).toMatchObject({ menuState, reconciliation: "CHECKED" });
  });
  it.each(["userId", "bindingId", "lineUserId"])("rejects client principal %s", async (field) => {
    h.body.mockResolvedValue({ ...tokens, [field]: "forged" });
    expect((await POST(request())).status).toBe(400);
    expect(h.refresh).not.toHaveBeenCalled(); expect(h.reconcile).not.toHaveBeenCalled();
  });
  it("checks origin before reading tokens", async () => {
    h.origin.mockRejectedValue(new Error("wrong origin"));
    expect((await POST(request())).status).toBe(503);
    expect(h.body).not.toHaveBeenCalled(); expect(h.reconcile).not.toHaveBeenCalled();
  });
  it("does not call provider after an unauthorized or mismatched LINE refresh", async () => {
    h.refresh.mockRejectedValue(new Error("private identity failure"));
    const response = await POST(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
    expect(h.reconcile).not.toHaveBeenCalled();
  });
  it("contains provider failure without creating or deleting bindings", async () => {
    h.reconcile.mockRejectedValue(new Error("private provider failure"));
    expect((await POST(request())).status).toBe(503);
    expect(h.reconcile).toHaveBeenCalledOnce(); expect(h.summary).not.toHaveBeenCalled();
  });
});
