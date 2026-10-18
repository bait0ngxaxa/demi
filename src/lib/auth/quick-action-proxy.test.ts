import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateSupabaseSession: vi.fn(),
}));

vi.mock("@/lib/auth/supabase-proxy", () => ({
  updateSupabaseSession: mocks.updateSupabaseSession,
}));

import { proxy } from "../../../proxy";

describe("quick-action return path propagation through Proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateSupabaseSession.mockResolvedValue(NextResponse.next());
  });

  it.each([
    ["/app/patients/assigned?task=screening", "/app/patients/assigned?task=screening"],
    ["/app/patients/assigned?task=followup", "/app/patients/assigned?task=followup"],
    ["/app/personal/appointments", "/app/personal/appointments"],
  ])("passes the bounded path from %s to the session proxy", async (url, returnTo) => {
    const request = new NextRequest(`https://demi.example.org${url}`);

    await proxy(request);

    expect(mocks.updateSupabaseSession).toHaveBeenCalledWith(request, returnTo);
  });

  it("does not pass unapproved or extra query parameters as a login return", async () => {
    const request = new NextRequest("https://demi.example.org/app/patients/assigned?task=screening&next=https://attacker.example");

    await proxy(request);

    expect(mocks.updateSupabaseSession).toHaveBeenCalledWith(request, null);
  });
});
