import { AsyncLocalStorage } from "node:async_hooks";

import { UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

/**
 * Vitest resolves the client React build, whose `cache()` never memoizes. This models the server render contract that
 * Next.js documents and React's Flight dispatcher implements (`getCacheForType` uses the active request's cache, or a
 * fresh Map when no render request is active): memoized within one render request, never across requests, and not at
 * all outside a render request.
 */
const renderRequest = new AsyncLocalStorage<Map<unknown, unknown>>();

function inRenderRequest<T>(render: () => Promise<T>): Promise<T> {
  return renderRequest.run(new Map(), render);
}

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T>(fn: () => T): (() => T) => () => {
      const requestCache = renderRequest.getStore();
      if (!requestCache) return fn();
      if (!requestCache.has(fn)) requestCache.set(fn, fn());
      return requestCache.get(fn) as T;
    },
  };
});
vi.mock("@/lib/auth/supabase-server", () => ({
  getServerSupabaseClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/db/prisma", () => ({
  getPrisma: () => ({ user: { findUnique: mocks.findUnique } }),
}));

import { getProtectedApplicationActor } from "./application-access-service";
import { getRequestApplicationActor } from "./request-application-actor";

const activeUser = {
  id: "user-1",
  personId: "person-1",
  status: UserStatus.ACTIVE,
  roles: [],
  memberships: [],
  osmHospitalRelationships: [],
};

/** The protected layout and its page resolve the actor independently, as separate server component trees do. */
async function renderLayoutAndPage(): Promise<unknown[]> {
  return Promise.all([getRequestApplicationActor(), getRequestApplicationActor(), getRequestApplicationActor()]);
}

describe("request-scoped protected application actor", () => {
  beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "auth-subject-1" } }, error: null });
    mocks.findUnique.mockReset().mockResolvedValue(activeUser);
  });

  it("shares one provider session check and one actor read across one render request", async () => {
    const actors = await inRenderRequest(renderLayoutAndPage);

    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect(new Set(actors).size).toBe(1);
    expect(actors[0]).toMatchObject({ userId: "user-1", personId: "person-1" });
  });

  it("resolves again for every new request, so a revocation applies from the next request", async () => {
    await inRenderRequest(renderLayoutAndPage);
    mocks.findUnique.mockResolvedValue({ ...activeUser, status: UserStatus.SUSPENDED });

    await expect(inRenderRequest(getRequestApplicationActor)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });

  it("gives every caller in one request the same denial", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const outcomes = await inRenderRequest(() => Promise.allSettled([getRequestApplicationActor(), getRequestApplicationActor()]));

    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe("rejected");
      expect(outcome.status === "rejected" && outcome.reason).toBeInstanceOf(UnauthenticatedError);
    }
  });

  it("does not memoize outside a render request", async () => {
    await getRequestApplicationActor();
    await getRequestApplicationActor();

    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });

  it("keeps the uncached resolver fresh on every call, even inside a render request", async () => {
    await inRenderRequest(async () => {
      await getRequestApplicationActor();
      await getProtectedApplicationActor();
      await getProtectedApplicationActor();
    });

    expect(mocks.getUser).toHaveBeenCalledTimes(3);
    expect(mocks.findUnique).toHaveBeenCalledTimes(3);
  });
});
