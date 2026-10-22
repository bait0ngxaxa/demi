import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateSupabaseSession: vi.fn() }));

vi.mock("@/lib/auth/supabase-proxy", () => ({ updateSupabaseSession: mocks.updateSupabaseSession }));

import { config, proxy } from "../../../proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("activation-link pages through Proxy (ADR-0018)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateSupabaseSession.mockResolvedValue(NextResponse.next());
  });

  it("marks the Parent network page and its server action responses no-store", async () => {
    for (const init of [undefined, { method: "POST", headers: { "next-action": "action-id" } }]) {
      const response = await proxy(new NextRequest("https://demi.example.org/app/hospitals/network?hospitalId=x", init));
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
  });

  it("leaves other pages to the framework defaults", async () => {
    const response = await proxy(new NextRequest("https://demi.example.org/app/hospitals/areas"));
    expect(response.headers.get("cache-control")).toBeNull();
  });

  it("redirects production requests with a non-canonical Host to the configured origin and preserves path and query", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://public.example.org");

    const response = await proxy(new NextRequest("https://untrusted.example.org/app/workforce?hospitalId=one"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://public.example.org/app/workforce?hospitalId=one");
    expect(mocks.updateSupabaseSession).not.toHaveBeenCalled();
  });

  it("applies canonical-origin redirects to static assets too", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://public.example.org");

    const response = await proxy(new NextRequest("https://untrusted.example.org/assets/logo.png"));

    expect(config.matcher).toEqual(["/:path*"]);
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://public.example.org/assets/logo.png");
    expect(mocks.updateSupabaseSession).not.toHaveBeenCalled();
  });

  it.each([
    ["/api/health/ready", "GET"],
    ["/api/internal/scheduler/tick", "GET"],
    ["/api/internal/scheduler/readiness", "GET"],
  ])("does not canonicalize the host-local probe or worker route %s", async (pathname, method) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://public.example.org");

    const response = await proxy(new NextRequest(`http://127.0.0.1:3000${pathname}`, { method }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    if (pathname.startsWith("/api/health")) {
      expect(mocks.updateSupabaseSession).not.toHaveBeenCalled();
    } else {
      expect(mocks.updateSupabaseSession).toHaveBeenCalledOnce();
    }
  });
});
