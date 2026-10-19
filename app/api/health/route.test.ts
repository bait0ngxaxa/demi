import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getApplicationReadiness: vi.fn() }));

vi.mock("@/lib/health/application-readiness", () => ({ getApplicationReadiness: mocks.getApplicationReadiness }));

import { GET as live } from "./live/route";
import { GET } from "./route";

const allTrue = { database: true, migrations: true, configuration: true };

describe("GET /api/health", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with boolean checks only when ready", async () => {
    mocks.getApplicationReadiness.mockResolvedValue({ ready: true, checks: allTrue });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok", checks: allTrue });
  });

  it.each(["database", "migrations", "configuration"] as const)("returns 503 when %s is not ready", async (failing) => {
    const checks = { ...allTrue, [failing]: false };
    mocks.getApplicationReadiness.mockResolvedValue({ ready: false, checks });
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ status: "unavailable", checks });
    expect(Object.values(body.checks).every((value) => typeof value === "boolean")).toBe(true);
  });
});

describe("GET /api/health/live", () => {
  it("answers without consulting readiness", async () => {
    vi.clearAllMocks();
    const response = live();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
    expect(mocks.getApplicationReadiness).not.toHaveBeenCalled();
  });
});
