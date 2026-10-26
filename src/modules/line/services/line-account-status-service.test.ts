import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ refresh: vi.fn(), summary: vi.fn(), reconcile: vi.fn(), session: vi.fn(), consume: vi.fn() }));
vi.mock("./line-account-service", () => ({ refreshLineAccountReachability: h.refresh, getLineAccountSummary: h.summary }));
vi.mock("./line-menu-reconciler", () => ({ reconcileLineBinding: h.reconcile }));
vi.mock("./line-session-service", () => ({ getCurrentLineSession: h.session }));
vi.mock("@/lib/env/server", () => ({ getLineLoginEnv: () => ({ DEMI_LINE_LOGIN_CHANNEL_ID: "123" }), getLineMessagingEnv: () => ({ DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "synthetic" }) }));
import { checkOwnLineAccountStatus, LineAccountStatusRateLimited, LINE_ACCOUNT_STATUS_PROVIDER_BUDGET_MS } from "./line-account-status-service";

const tokens = { idToken: "id-proof", accessToken: "access-proof" };
const summary = { status: "LINKED", canUnlink: true, reachability: "FRIEND", menuState: "APPLIED", cleanupState: null };
const now = new Date("2026-10-26T03:02:30.000Z");
const options = (): Parameters<typeof checkOwnLineAccountStatus>[1] => ({ rateLimiter: { consume: h.consume }, now: () => now });
beforeEach(() => {
  vi.resetAllMocks(); h.session.mockResolvedValue({ userId: "server-user", sessionHash: "server-session" });
  h.consume.mockResolvedValue(true); h.refresh.mockResolvedValue({ bindingId: "verified-binding" });
  h.reconcile.mockResolvedValue("RECONCILED"); h.summary.mockResolvedValue(summary);
});

describe("bounded account status operation", () => {
  it("authenticates once, consumes dedicated quotas before verification and reads summary after completion", async () => {
    const result = await checkOwnLineAccountStatus(tokens, options());
    expect(result).toEqual({ ...summary, reconciliation: "CHECKED" });
    expect(h.session).toHaveBeenCalledOnce();
    expect(h.consume.mock.calls).toEqual([["ACCOUNT_STATUS_USER", "server-user", now], ["ACCOUNT_STATUS_GLOBAL", "GLOBAL", now]]);
    expect(h.session.mock.invocationCallOrder[0]).toBeLessThan(h.consume.mock.invocationCallOrder[0]);
    expect(h.consume.mock.invocationCallOrder[1]).toBeLessThan(h.refresh.mock.invocationCallOrder[0]);
    const dependencies = h.refresh.mock.calls[0][1];
    expect(await dependencies.currentSession()).toEqual({ userId: "server-user", sessionHash: "server-session" });
    expect(h.summary.mock.calls[0][0]).toBe(dependencies);
    expect(h.reconcile.mock.invocationCallOrder[0]).toBeLessThan(h.summary.mock.invocationCallOrder[0]);
    expect(LINE_ACCOUNT_STATUS_PROVIDER_BUDGET_MS).toBe(12_000);
  });
  it.each([0, 1])("rejects quota %s before any LINE call", async (blocked) => {
    h.consume.mockImplementation(async (category) => category !== (blocked ? "ACCOUNT_STATUS_GLOBAL" : "ACCOUNT_STATUS_USER"));
    const error = await checkOwnLineAccountStatus(tokens, options()).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(LineAccountStatusRateLimited);
    expect(error).toMatchObject({ retryAfter: 150 });
    expect(h.refresh).not.toHaveBeenCalled(); expect(h.reconcile).not.toHaveBeenCalled();
  });
  it("fails closed on shared storage failure without provider work", async () => {
    h.consume.mockRejectedValue(new Error("storage down"));
    await expect(checkOwnLineAccountStatus(tokens, options())).rejects.toThrow();
    expect(h.refresh).not.toHaveBeenCalled(); expect(h.reconcile).not.toHaveBeenCalled();
  });
  it("requires session before quota and never masks identity failure as pending", async () => {
    h.session.mockRejectedValueOnce(new Error("unauthenticated"));
    await expect(checkOwnLineAccountStatus(tokens, options())).rejects.toThrow(); expect(h.consume).not.toHaveBeenCalled();
    h.refresh.mockRejectedValue(new Error("wrong LINE owner"));
    await expect(checkOwnLineAccountStatus(tokens, options())).rejects.toThrow(); expect(h.reconcile).not.toHaveBeenCalled();
  });
  it.each(["BUSY", "MISSING"])("returns %s as pending without looping", async (outcome) => {
    h.reconcile.mockResolvedValue(outcome);
    expect(await checkOwnLineAccountStatus(tokens, options())).toMatchObject({ reconciliation: "PENDING" });
    expect(h.reconcile).toHaveBeenCalledOnce();
  });
  it("does not report provider unavailability as checked", async () => {
    h.summary.mockResolvedValue({ ...summary, menuState: "UNAVAILABLE" });
    await expect(checkOwnLineAccountStatus(tokens, options())).rejects.toMatchObject({ code: "LINE_PROVIDER_TRANSIENT" });
  });
  it("uses one signal for verification and messaging, awaits abort handling, and never reads a false completed summary", async () => {
    const controller = new AbortController();
    const signals: (AbortSignal | null | undefined)[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      signals.push(init?.signal);
      return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    });
    let settled = false;
    h.reconcile.mockImplementation(async (_binding, dependencies) => {
      try { await dependencies.provider.getUserMenu("U" + "a".repeat(32)); } catch { settled = true; }
      return "RECONCILED";
    });
    const running = checkOwnLineAccountStatus(tokens, { ...options(), signal: controller.signal, fetcher });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort();
    await expect(running).rejects.toThrow();
    expect(settled).toBe(true); expect(signals[0]?.aborted).toBe(true);
    expect(h.summary).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledOnce();
  });
  it("stops before another provider call when verification consumes the shared deadline", async () => {
    const controller = new AbortController(); const fetcher = vi.fn<typeof fetch>();
    h.refresh.mockImplementation(async (_input, dependencies) => {
      controller.abort();
      await dependencies.verifyIdentity("id-proof");
    });
    await expect(checkOwnLineAccountStatus(tokens, { ...options(), signal: controller.signal, fetcher })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled(); expect(h.reconcile).not.toHaveBeenCalled();
  });
});
