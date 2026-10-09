import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { propagateSupabaseCookies, updateSupabaseSession } from "./supabase-proxy";

describe("Supabase proxy cookie propagation", () => {
  it.each(["/api/line/account/recovery", "/api/line/account/recovery/prepare"])("leaves captured recovery cookies unchanged without proxy verification/refresh at %s", async (path) => {
    const request = new NextRequest(`https://demi.example.org${path}`, { method: "POST", headers: { cookie: "captured=cookie-value" } });
    const network = vi.spyOn(globalThis, "fetch");
    try {
      const response = await updateSupabaseSession(request);
      expect(request.cookies.get("captured")?.value).toBe("cookie-value");
      expect(response.cookies.getAll()).toEqual([]);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });
  it("updates the current request and outgoing response", () => {
    const request = new NextRequest("http://localhost.test/");

    const response = propagateSupabaseCookies(
      request,
      [
        {
          name: "sb-session",
          value: "refreshed",
          options: { httpOnly: true, path: "/" },
        },
      ],
      { "Cache-Control": "private, no-store" },
    );

    expect(request.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
