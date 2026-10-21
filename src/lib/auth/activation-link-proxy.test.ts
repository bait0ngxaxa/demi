import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateSupabaseSession: vi.fn() }));

vi.mock("@/lib/auth/supabase-proxy", () => ({ updateSupabaseSession: mocks.updateSupabaseSession }));

import { proxy } from "../../../proxy";

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
});
