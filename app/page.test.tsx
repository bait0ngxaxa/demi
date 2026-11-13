import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), init: vi.fn(), redirect: vi.fn() }));

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@line/liff", () => ({ default: { init: mocks.init } }));
vi.mock("@/modules/auth/services/actor-context-service", () => ({ resolveCurrentActorAccess: mocks.access }));

import Home from "./page";

async function render(query: Record<string, string | string[]> = {}): Promise<React.JSX.Element> {
  return Home({ searchParams: Promise.resolve(query) });
}

type EntryProps = { mode: string; liffId: string | null; destination: string | null; fallbackHref: string };

describe("GET / entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-Account");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID", "1234567890-Workspace");
    mocks.access.mockResolvedValue({ status: "UNAUTHENTICATED" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["AUTHORIZED", "/app"],
    ["UNAUTHENTICATED", "/login"],
    ["FORBIDDEN", "/login"],
  ])("keeps the ordinary %s continuation and never issues a server redirect that would drop LIFF credentials", async (status, fallbackHref) => {
    mocks.access.mockResolvedValue({ status });
    const element = await render();
    expect(element.props as EntryProps).toEqual({ mode: "ORDINARY", liffId: "1234567890-Workspace", destination: null, fallbackHref });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("passes an allowlisted liff.state destination to the client entry without SDK work on the server", async () => {
    const element = await render({ "liff.state": "/app/personal/medications" });
    expect(element.props as EntryProps).toMatchObject({ mode: "LIFF", destination: "/app/personal/medications", liffId: "1234567890-Workspace" });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("กำลังเชื่อมต่อกับ LINE");
    expect(markup).toContain("motion-safe:animate-spin");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain("1234567890-Account");
    expect(mocks.init).not.toHaveBeenCalled();
  });

  it.each([
    [{ "liff.state": "/app/personal/medications", lineAppVersion: "14.19.1" }, "/app/personal/medications"],
    [{ lineAppVersion: "14.19.1" }, null],
    [{ "liff.state": "/app", "liff.referrer": "https://liff.line.me/1234567890-Account", "liff.newParameter": "1" }, "/app"],
  ])("hands LINE-generated platform parameters %j to LIFF initialization instead of rejecting them", async (query, destination) => {
    const element = await render(query);
    expect(element.props as EntryProps).toMatchObject({ mode: "LIFF", destination, liffId: "1234567890-Workspace" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("rejects untrusted liff.state before LIFF initialization", async () => {
    const element = await render({ "liff.state": "/line/account" });
    expect(element.props as EntryProps).toMatchObject({ mode: "NAVIGATION_INVALID", destination: null });
  });

  it("does not substitute the Account or MINI LIFF when Workspace LIFF is unavailable", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID", "");
    vi.stubEnv("DEMI_LINE_MINI_APP_LIFF_ID", "2000000001-MiniDev");
    const element = await render({ "liff.state": "/app" });
    expect(element.props as EntryProps).toMatchObject({ mode: "LIFF", liffId: null });
  });

  it("renders a usable continue link for ordinary browsers without JavaScript", async () => {
    mocks.access.mockResolvedValue({ status: "AUTHORIZED" });
    const markup = renderToStaticMarkup(await render());
    expect(markup).toContain('href="/app"');
    expect(markup).toContain("กำลังเปิด DEMI");
  });
});
