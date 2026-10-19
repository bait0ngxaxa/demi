import { afterEach, describe, expect, it, vi } from "vitest";

const constructed = vi.hoisted(() => ({ count: 0 }));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor() {
      constructed.count += 1;
    }
  },
}));

vi.mock("@/lib/env/server", () => ({ getServerEnv: vi.fn() }));

describe("getPrisma", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { demiPrisma?: unknown }).demiPrisma;
    constructed.count = 0;
    vi.resetModules();
  });

  it.each(["production", "development", "test"])("reuses one client per process when NODE_ENV is %s", async (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    delete (globalThis as { demiPrisma?: unknown }).demiPrisma;
    const { getPrisma } = await import("./prisma");
    const first = getPrisma();
    expect(getPrisma()).toBe(first);
    expect(getPrisma()).toBe(first);
    expect(constructed.count).toBe(1);
  });
});
