import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateSupabaseSession: vi.fn() }));
vi.mock("@/lib/auth/supabase-proxy", () => ({ updateSupabaseSession: mocks.updateSupabaseSession }));
import { proxy } from "../../../proxy";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateSupabaseSession.mockResolvedValue(NextResponse.next());
});

describe("Workspace document transport rewrite", () => {
  it.each(["/app", "/app/personal/medications?liff.hback=2&lineAppVersion=14.19.1", "/login?returnTo=%2Fapp%2Fpersonal%2Fmedications"])("serves only the public gate for document %s", async (path) => {
    const request = new NextRequest(`https://demi.example.org${path}`, { headers: { accept: "text/html", "sec-fetch-dest": "document" } });
    const response = await proxy(request);
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://demi.example.org/workspace-liff-document");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.updateSupabaseSession).not.toHaveBeenCalled();
    expect(request.nextUrl.pathname + request.nextUrl.search).toBe(path);
  });

  it("keeps RSC and server actions on the existing authenticated server boundary", async () => {
    const requests: { method?: string; headers: Record<string, string> }[] = [
      { headers: { rsc: "1", "sec-fetch-dest": "empty" } },
      { method: "POST", headers: { "next-action": "action-id" } },
    ];
    for (const init of requests) {
      const request = new NextRequest("https://demi.example.org/app/personal/medications", init);
      const response = await proxy(request);
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(mocks.updateSupabaseSession).toHaveBeenCalledWith(request, "/app/personal/medications");
    }
  });

  it.each(["/line/account", "/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS", "/api/line/account"])("does not rewrite Account/MINI/API route %s", async (path) => {
    const response = await proxy(new NextRequest(`https://demi.example.org${path}`));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("does not rewrite the public shell target to itself", async () => {
    const response = await proxy(new NextRequest("https://demi.example.org/workspace-liff-document", { headers: { accept: "text/html" } }));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
