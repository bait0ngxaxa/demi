import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  LINE_QUICK_ACTION_RETURN_TO_HEADER,
  LINE_WEB_NAVIGATION_PATHS,
} from "@/modules/line/domain/line-navigation-intents";

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
  it.each(["/line/workflow", "/line/workflow/appointments", "/api/line/workflow/verify"])("marks MINI workflow responses private, uncached and referrer-free at %s", (path) => {
    const response = propagateSupabaseCookies(new NextRequest(`https://demi.example.org${path}?liff.state=`), [], {});
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
  });
  it.each(["/line/workflowx", "/app/personal/appointments", "/line/account"])("does not apply MINI workflow headers to %s", (path) => {
    const response = propagateSupabaseCookies(new NextRequest(`https://demi.example.org${path}`), [], {});
    expect(response.headers.get("referrer-policy")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
  });
  it("keeps SSR auth cache headers while adding the workflow referrer policy", () => {
    const response = propagateSupabaseCookies(new NextRequest("https://demi.example.org/line/workflow"), [], {
      "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0", Expires: "0", Pragma: "no-cache",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-cache, no-store, must-revalidate, max-age=0");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
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

  it("overwrites a caller-supplied return header with the proxy-validated target", () => {
    const request = new NextRequest("https://demi.example.org/app/patients/assigned?task=screening", {
      headers: { [LINE_QUICK_ACTION_RETURN_TO_HEADER]: "https://attacker.example/" },
    });

    const response = propagateSupabaseCookies(
      request,
      [],
      {},
      LINE_WEB_NAVIGATION_PATHS.START_OSM_SCREENING,
    );

    expect(response.headers.get(`x-middleware-request-${LINE_QUICK_ACTION_RETURN_TO_HEADER}`)).toBe(
      LINE_WEB_NAVIGATION_PATHS.START_OSM_SCREENING,
    );
  });

  it("strips a caller-supplied return header when no approved target exists", () => {
    const request = new NextRequest("https://demi.example.org/app/admin", {
      headers: { [LINE_QUICK_ACTION_RETURN_TO_HEADER]: "/app/personal/appointments" },
    });

    const response = propagateSupabaseCookies(request, [], {});

    expect(response.headers.get(`x-middleware-request-${LINE_QUICK_ACTION_RETURN_TO_HEADER}`)).toBeNull();
  });
});
