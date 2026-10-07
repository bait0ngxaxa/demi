import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const callbacks: Array<() => void | Promise<void>> = [];
  return {
    callbacks,
    after: vi.fn((callback: () => void | Promise<void>) => {
      callbacks.push(callback);
    }),
    resolveTarget: vi.fn<() => Promise<string | null>>(),
    reconcile: vi.fn<(bindingIds: readonly string[]) => Promise<unknown>>(),
  };
});

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("../services/line-entry-reconciliation", () => ({
  resolveCurrentLineReconciliationTarget: mocks.resolveTarget,
}));
vi.mock("../services/line-menu-reconciler", () => ({ reconcileLineBindingIds: mocks.reconcile }));

import {
  scheduleCurrentLineAccountReconciliation,
  scheduleLineBindingReconciliation,
} from "./line-reconciliation-scheduler";

describe("LINE post-response reconciliation scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callbacks.length = 0;
    mocks.resolveTarget.mockResolvedValue(null);
    mocks.reconcile.mockResolvedValue(undefined);
  });

  it("resolves the account target before scheduling and passes only its binding ID", async () => {
    mocks.resolveTarget.mockResolvedValue("binding-opaque-id");

    await scheduleCurrentLineAccountReconciliation();

    expect(mocks.resolveTarget).toHaveBeenCalledOnce();
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    await mocks.callbacks[0]?.();
    expect(mocks.reconcile).toHaveBeenCalledWith(["binding-opaque-id"]);
  });

  it("does not schedule when no binding needs reconciliation", async () => {
    await scheduleCurrentLineAccountReconciliation();

    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("deduplicates IDs and contains post-response provider failures", async () => {
    mocks.reconcile.mockRejectedValue(new Error("provider unavailable"));
    scheduleLineBindingReconciliation(["binding-a", "binding-a", "binding-b"]);

    expect(mocks.after).toHaveBeenCalledOnce();
    await expect(mocks.callbacks[0]?.()).resolves.toBeUndefined();
    expect(mocks.reconcile).toHaveBeenCalledWith(["binding-a", "binding-b"]);
  });

  it("does not register empty work", () => {
    scheduleLineBindingReconciliation([]);

    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("contains scheduling-context failures after the local operation has committed", () => {
    mocks.after.mockImplementation(() => {
      throw new Error("no active request context");
    });

    expect(() => scheduleLineBindingReconciliation(["binding-id"])).not.toThrow();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
