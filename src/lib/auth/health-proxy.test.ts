import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateSupabaseSession: vi.fn() }));

vi.mock("@/lib/auth/supabase-proxy", () => ({ updateSupabaseSession: mocks.updateSupabaseSession }));

import { proxy } from "../../../proxy";

describe("health probes through Proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateSupabaseSession.mockResolvedValue(NextResponse.next());
  });

  it.each(["/api/health", "/api/health/live"])("passes %s through without a session refresh", async (path) => {
    const response = await proxy(new NextRequest(`https://demi.example.org${path}`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.updateSupabaseSession).not.toHaveBeenCalled();
  });

  it.each(["/api/healthz", "/api/health/live/extra", "/api/internal/scheduler/readiness"])("keeps the session proxy for %s", async (path) => {
    await proxy(new NextRequest(`https://demi.example.org${path}`));
    expect(mocks.updateSupabaseSession).toHaveBeenCalledOnce();
  });
});
