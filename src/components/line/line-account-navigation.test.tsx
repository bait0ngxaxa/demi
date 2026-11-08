// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { WORKSPACE_LIFF_CONTEXT_KEY } from "@/modules/line/domain/line-liff-browser";

import { LineAccountLink, LineAccountNavigationProvider, useLineAccountHrefFor } from "./line-account-navigation";

const ACCOUNT_LIFF_URL = "https://liff.line.me/1234567890-Account";
const LIFF_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari Line/14.19.0 LIFF";
const CHROME_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";

let container: HTMLDivElement;
let root: Root;

function setUserAgent(value: string): void {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(value);
}

function renderLink(accountLiffUrl: string | null | undefined): string | null {
  const link = <LineAccountLink className="link">บัญชี LINE</LineAccountLink>;
  act(() => root.render(accountLiffUrl === undefined ? link : <LineAccountNavigationProvider accountLiffUrl={accountLiffUrl}>{link}</LineAccountNavigationProvider>));
  return container.querySelector("a")?.getAttribute("href") ?? null;
}

function HrefProbe({ href }: { href: string }): React.JSX.Element {
  return <span data-href={useLineAccountHrefFor(href)} />;
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("LINE account navigation", () => {
  it("opens the Account LIFF URL from the Workspace LIFF browser (LIFF-to-LIFF transition)", () => {
    setUserAgent(LIFF_USER_AGENT);
    window.sessionStorage.setItem(WORKSPACE_LIFF_CONTEXT_KEY, "1");
    expect(renderLink(ACCOUNT_LIFF_URL)).toBe(ACCOUNT_LIFF_URL);
  });

  it("keeps the existing route in an ordinary browser even with a marker", () => {
    setUserAgent(CHROME_USER_AGENT);
    window.sessionStorage.setItem(WORKSPACE_LIFF_CONTEXT_KEY, "1");
    expect(renderLink(ACCOUNT_LIFF_URL)).toBe("/line/account");
  });

  it("keeps the existing route in a LIFF browser the Workspace entry did not open (MINI App, Account LIFF)", () => {
    setUserAgent(LIFF_USER_AGENT);
    expect(renderLink(ACCOUNT_LIFF_URL)).toBe("/line/account");
  });

  it("fails safe to the existing route when the Account LIFF is not configured or not provided", () => {
    setUserAgent(LIFF_USER_AGENT);
    window.sessionStorage.setItem(WORKSPACE_LIFF_CONTEXT_KEY, "1");
    expect(renderLink(null)).toBe("/line/account");
    expect(renderLink(undefined)).toBe("/line/account");
  });

  it("never follows an arbitrary destination handed to the provider", () => {
    setUserAgent(LIFF_USER_AGENT);
    window.sessionStorage.setItem(WORKSPACE_LIFF_CONTEXT_KEY, "1");
    expect(renderLink("https://evil.example/line/account")).toBe("/line/account");
    expect(renderLink("https://liff.line.me/1234567890-Account?liff.state=/app/admin")).toBe("/line/account");
  });

  it("renders the ordinary route on the server so SSR never depends on browser context", () => {
    const markup = renderToStaticMarkup(
      <LineAccountNavigationProvider accountLiffUrl={ACCOUNT_LIFF_URL}><LineAccountLink>บัญชี LINE</LineAccountLink></LineAccountNavigationProvider>,
    );
    expect(markup).toContain('href="/line/account"');
    expect(markup).not.toContain("liff.line.me");
  });

  it("rewrites only the Account route for callers with their own href", () => {
    setUserAgent(LIFF_USER_AGENT);
    window.sessionStorage.setItem(WORKSPACE_LIFF_CONTEXT_KEY, "1");
    act(() => root.render(
      <LineAccountNavigationProvider accountLiffUrl={ACCOUNT_LIFF_URL}>
        <HrefProbe href="/line/account" />
        <HrefProbe href="#line-account-status" />
      </LineAccountNavigationProvider>,
    ));
    expect([...container.querySelectorAll("span")].map((node) => node.dataset.href)).toEqual([ACCOUNT_LIFF_URL, "#line-account-status"]);
  });
});
