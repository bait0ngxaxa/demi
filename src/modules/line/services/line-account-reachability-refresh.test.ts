import { LineReachability, UserStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { LineFailure } from "../domain/line-errors";
import { LINE_REACHABILITY_BACKGROUND_REFRESH_MIN_AGE_MS, refreshLineAccountReachabilityIfStale } from "./line-account-service";
import type { LineWorkflowRateLimiter } from "./line-workflow-rate-limit";

const userId = "83da3ab8-2895-4cab-bb63-19f807246288";
const bindingId = "1a9c6559-3f23-44b6-b920-07d176777772";
const lineSubject = `U${"a".repeat(32)}`;
const now = new Date("2026-11-16T00:00:00.000Z");
const tokens = { idToken: "temporary-id-token-value-00000", accessToken: "temporary-access-token-value-00000" };
const DAY_MS = 24 * 60 * 60 * 1000;

type Binding = {
  id: string; userId: string; lineUserId: string | null; lifecycleVersion: number; unlinkedAt: Date | null;
  reachability: LineReachability; reachabilityObservedAt: Date | null; providerCleanupState: null;
};

function harness(options: { binding?: Partial<Binding> | null; userStatus?: UserStatus; friend?: boolean; subject?: string; allowed?: boolean } = {}) {
  const binding: Binding | null = options.binding === null ? null : {
    id: bindingId, userId, lineUserId: lineSubject, lifecycleVersion: 3, unlinkedAt: null,
    reachability: LineReachability.FRIEND, reachabilityObservedAt: new Date(now.getTime() - 31 * DAY_MS), providerCleanupState: null,
    ...options.binding,
  };
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: bindingId }]),
    lineAccountBinding: {
      findUnique: vi.fn(async () => binding && { ...binding }),
      update: vi.fn(async ({ data }: { data: Partial<Binding> }) => {
        if (binding) Object.assign(binding, data);
        return binding;
      }),
    },
  };
  const database = {
    user: { findUnique: vi.fn(async () => ({ status: options.userStatus ?? UserStatus.ACTIVE })) },
    lineAccountBinding: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; unlinkedAt: null } }) =>
        binding && binding.userId === where.userId && binding.unlinkedAt === null ? { ...binding } : null),
    },
    $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
  } as unknown as PrismaClient;
  const verifyIdentity = vi.fn(async () => ({ subject: options.subject ?? lineSubject }));
  const verifyFriendship = vi.fn(async () => ({ friend: options.friend ?? true }));
  const consume = vi.fn(async () => options.allowed ?? true);
  const rateLimiter: LineWorkflowRateLimiter = { consume };
  const dependencies = {
    database, now: () => now, verifyIdentity, verifyFriendship, rateLimiter,
    currentSession: async () => ({ userId, sessionHash: "a".repeat(64) }),
  };
  return { binding, dependencies, verifyIdentity, verifyFriendship, consume, tx };
}

describe("background LINE reachability refresh", () => {
  it("verifies a stale FRIEND observation with LINE and advances its observation time", async () => {
    const h = harness();
    await expect(refreshLineAccountReachabilityIfStale(tokens, h.dependencies)).resolves.toBe("REFRESHED");
    expect(h.verifyIdentity).toHaveBeenCalledWith(tokens.idToken);
    expect(h.verifyFriendship).toHaveBeenCalledWith(tokens.accessToken, lineSubject);
    expect(h.binding).toMatchObject({ reachability: LineReachability.FRIEND, reachabilityObservedAt: now });
    expect(h.consume.mock.calls).toEqual([["REACHABILITY_REFRESH_USER", userId, now], ["REACHABILITY_REFRESH_GLOBAL", "GLOBAL", now]]);
  });

  it("skips the provider and the quota while a FRIEND observation is fresh", async () => {
    const observedAt = new Date(now.getTime() - LINE_REACHABILITY_BACKGROUND_REFRESH_MIN_AGE_MS + 1);
    const h = harness({ binding: { reachabilityObservedAt: observedAt } });
    await expect(refreshLineAccountReachabilityIfStale(tokens, h.dependencies)).resolves.toBe("FRESH");
    expect(h.verifyIdentity).not.toHaveBeenCalled();
    expect(h.verifyFriendship).not.toHaveBeenCalled();
    expect(h.consume).not.toHaveBeenCalled();
    expect(h.binding?.reachabilityObservedAt).toBe(observedAt);
  });

  it.each([
    ["exactly the minimum age", { reachabilityObservedAt: new Date(now.getTime() - LINE_REACHABILITY_BACKGROUND_REFRESH_MIN_AGE_MS) }],
    ["a recent NOT_FRIEND observation", { reachability: LineReachability.NOT_FRIEND, reachabilityObservedAt: new Date(now.getTime() - 1000) }],
    ["an UNKNOWN observation", { reachability: LineReachability.UNKNOWN, reachabilityObservedAt: null }],
  ])("re-checks %s", async (_label, binding) => {
    const h = harness({ binding });
    await expect(refreshLineAccountReachabilityIfStale(tokens, h.dependencies)).resolves.toBe("REFRESHED");
    expect(h.verifyFriendship).toHaveBeenCalledOnce();
    expect(h.binding).toMatchObject({ reachability: LineReachability.FRIEND, reachabilityObservedAt: now });
  });

  it("records a NOT_FRIEND result, which keeps delivery suppressed", async () => {
    const h = harness({ friend: false });
    await expect(refreshLineAccountReachabilityIfStale(tokens, h.dependencies)).resolves.toBe("REFRESHED");
    expect(h.binding).toMatchObject({ reachability: LineReachability.NOT_FRIEND, reachabilityObservedAt: now });
  });

  it("rejects an ID token whose subject is not the bound LINE user, without recording anything", async () => {
    const h = harness({ subject: `U${"b".repeat(32)}` });
    const before = h.binding?.reachabilityObservedAt;
    await expect(refreshLineAccountReachabilityIfStale(tokens, h.dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    expect(h.verifyFriendship).not.toHaveBeenCalled();
    expect(h.tx.lineAccountBinding.update).not.toHaveBeenCalled();
    expect(h.binding?.reachabilityObservedAt).toBe(before);
  });

  it("returns NO_BINDING without error or provider work for no active binding or an inactive user", async () => {
    for (const h of [harness({ binding: null }), harness({ binding: { unlinkedAt: now } }), harness({ userStatus: UserStatus.SUSPENDED })]) {
      await expect(refreshLineAccountReachabilityIfStale(tokens, h.dependencies)).resolves.toBe("NO_BINDING");
      expect(h.verifyIdentity).not.toHaveBeenCalled();
      expect(h.consume).not.toHaveBeenCalled();
    }
  });

  it("returns SIGNED_OUT instead of throwing when there is no DEMI session", async () => {
    const h = harness();
    const dependencies = { ...h.dependencies, currentSession: async () => { throw new UnauthenticatedError(); } };
    await expect(refreshLineAccountReachabilityIfStale(tokens, dependencies)).resolves.toBe("SIGNED_OUT");
    expect(h.verifyIdentity).not.toHaveBeenCalled();
  });

  it("stops before the provider when the refresh quota is exhausted", async () => {
    const h = harness({ allowed: false });
    await expect(refreshLineAccountReachabilityIfStale(tokens, h.dependencies)).rejects.toMatchObject({ code: "LINE_RATE_LIMITED" } satisfies Partial<LineFailure>);
    expect(h.verifyIdentity).not.toHaveBeenCalled();
  });
});
