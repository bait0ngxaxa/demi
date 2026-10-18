import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateSupabaseSession: vi.fn(),
}));

vi.mock("@/lib/auth/supabase-proxy", () => ({
  updateSupabaseSession: mocks.updateSupabaseSession,
}));

import { config, proxy } from "../../../proxy";

const SCOPED = "https://demi.example.org/line/workflow/appointments/11111111-1111-4111-8111-111111111111";

describe("MINI namespace filtering through Proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateSupabaseSession.mockResolvedValue(NextResponse.next());
  });

  it("forwards scoped GET rendering and RSC requests to the session proxy", async () => {
    for (const headers of [{}, { rsc: "1" }] as Array<Record<string, string>>) {
      const request = new NextRequest(SCOPED, { headers });
      await proxy(request);
      expect(mocks.updateSupabaseSession).toHaveBeenLastCalledWith(request, null);
    }
  });

  it("rejects an ordinary Server Action POST to a scoped page before session refresh or dispatch", async () => {
    const response = await proxy(new NextRequest(SCOPED, {
      method: "POST",
      headers: { "next-action": "7f".repeat(21), "content-type": "text/plain;charset=UTF-8" },
      body: "[]",
    }));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(response.headers.get("cache-control")).toBe("private, no-cache, no-store, must-revalidate, max-age=0");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("");
    expect(mocks.updateSupabaseSession).not.toHaveBeenCalled();
  });

  it("rejects a no-JavaScript form-action POST", async () => {
    const form = new FormData();
    form.set("$ACTION_ID_7f7f7f7f", "");
    const response = await proxy(new NextRequest(SCOPED, { method: "POST", body: form }));
    expect(response.status).toBe(405);
    expect(mocks.updateSupabaseSession).not.toHaveBeenCalled();
  });

  it("rejects a Next-Action header on GET and an unknown scoped path", async () => {
    expect((await proxy(new NextRequest(SCOPED, { headers: { "next-action": "7f" } }))).status).toBe(400);
    expect((await proxy(new NextRequest(`${SCOPED}/acknowledge`, { method: "POST" }))).status).toBe(404);
    expect(mocks.updateSupabaseSession).not.toHaveBeenCalled();
  });

  it("forwards only a plain POST to the fixed interaction handlers", async () => {
    for (const path of ["acknowledge", "cancellation-request"]) {
      const url = `https://demi.example.org/line/workflow/appointments/${path}`;
      const post = new NextRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      await proxy(post);
      expect(mocks.updateSupabaseSession).toHaveBeenLastCalledWith(post, null);
      const get = await proxy(new NextRequest(url));
      expect(get.status).toBe(405);
      expect(get.headers.get("allow")).toBe("POST");
      expect(get.headers.get("cache-control")).toBe("private, no-cache, no-store, must-revalidate, max-age=0");
      expect(get.headers.get("referrer-policy")).toBe("no-referrer");
      expect(get.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
      expect(get.headers.get("x-content-type-options")).toBe("nosniff");
      const action = await proxy(new NextRequest(url, { method: "POST", headers: { "next-action": "7f".repeat(21) }, body: "[]" }));
      expect(action.status).toBe(400);
      expect(await action.text()).toBe("");
    }
    expect(mocks.updateSupabaseSession).toHaveBeenCalledTimes(2);
  });

  it("keeps the B1 verification POST and ordinary routes on the existing path", async () => {
    const verify = new NextRequest("https://demi.example.org/api/line/workflow/verify", { method: "POST" });
    await proxy(verify);
    expect(mocks.updateSupabaseSession).toHaveBeenLastCalledWith(verify, null);
    const ordinary = new NextRequest("https://demi.example.org/app/personal/appointments", { method: "POST", headers: { "next-action": "7f" } });
    await proxy(ordinary);
    expect(mocks.updateSupabaseSession).toHaveBeenLastCalledWith(ordinary, "/app/personal/appointments");
  });

  it("matches the whole MINI namespace, including asset-like final segments", () => {
    expect(config.matcher).toEqual(expect.arrayContaining(["/line/workflow/:path*", "/api/line/workflow/:path*"]));
  });
});
