import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { propagateSupabaseCookies } from "./supabase-proxy";

describe("Supabase proxy cookie propagation", () => {
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
