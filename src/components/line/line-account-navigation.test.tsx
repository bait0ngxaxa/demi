// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { LIFF_BROWSER_CONTEXT_KEY, type LiffBrowserContext } from "@/modules/line/domain/line-liff-browser";

import { LineAccountLink, LineAccountNavigationProvider, LineWorkspaceLink, useLineAccountHrefFor } from "./line-account-navigation";
import { recordCurrentLiffBrowserEntry } from "./liff-browser-context-store";

const ACCOUNT_LIFF_URL = "https://liff.line.me/1234567890-Account";
const WORKSPACE_LIFF_URL = "https://liff.line.me/1234567890-Workspace/app";

let container: HTMLDivElement;
let root: Root;

function setContext(value: LiffBrowserContext | null): void {
  if (value) window.sessionStorage.setItem(LIFF_BROWSER_CONTEXT_KEY, JSON.stringify(value));
  else window.sessionStorage.removeItem(LIFF_BROWSER_CONTEXT_KEY);
}

function hrefOf(element: React.JSX.Element): string | null {
  act(() => root.render(element));
  return container.querySelector("a")?.getAttribute("href") ?? null;
}

function accountLink(accountLiffUrl: string | null | undefined): string | null {
  const link = <LineAccountLink className="link">บัญชี LINE</LineAccountLink>;
  return hrefOf(accountLiffUrl === undefined ? link : <LineAccountNavigationProvider accountLiffUrl={accountLiffUrl}>{link}</LineAccountNavigationProvider>);
}

function workspaceLink(workspaceLiffUrl: string | null): string | null {
  return hrefOf(<LineWorkspaceLink workspaceLiffUrl={workspaceLiffUrl}>ใช้งาน DEMI</LineWorkspaceLink>);
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
});

describe("LINE account navigation (Workspace -> Account)", () => {
  it("opens the Account LIFF URL from the Workspace LIFF (LIFF-to-LIFF transition)", () => {
    setContext({ current: "WORKSPACE", mini: false, workspace: "READY" });
    expect(accountLink(ACCOUNT_LIFF_URL)).toBe(ACCOUNT_LIFF_URL);
  });

  it("keeps the existing route in an ordinary browser, the Account LIFF and a MINI session", () => {
    expect(accountLink(ACCOUNT_LIFF_URL)).toBe("/line/account");
    setContext({ current: "ACCOUNT", mini: false, workspace: "READY" });
    expect(accountLink(ACCOUNT_LIFF_URL)).toBe("/line/account");
    setContext({ current: "MINI", mini: true, workspace: null });
    expect(accountLink(ACCOUNT_LIFF_URL)).toBe("/line/account");
  });

  it("fails safe to the existing route when the Account LIFF is not configured or not provided", () => {
    setContext({ current: "WORKSPACE", mini: false, workspace: "READY" });
    expect(accountLink(null)).toBe("/line/account");
    expect(accountLink(undefined)).toBe("/line/account");
    expect(accountLink("https://evil.example/line/account")).toBe("/line/account");
  });

  it("re-renders when an entry is recorded later in the same document", () => {
    expect(accountLink(ACCOUNT_LIFF_URL)).toBe("/line/account");
    act(() => recordCurrentLiffBrowserEntry("WORKSPACE"));
    expect(container.querySelector("a")?.getAttribute("href")).toBe(ACCOUNT_LIFF_URL);
  });

  it("renders the ordinary routes on the server so SSR never depends on browser context", () => {
    const markup = renderToStaticMarkup(
      <LineAccountNavigationProvider accountLiffUrl={ACCOUNT_LIFF_URL}>
        <LineAccountLink>บัญชี LINE</LineAccountLink>
        <LineWorkspaceLink workspaceLiffUrl={WORKSPACE_LIFF_URL}>DEMI</LineWorkspaceLink>
      </LineAccountNavigationProvider>,
    );
    expect(markup).toContain('href="/line/account"');
    expect(markup).toContain('href="/app"');
    expect(markup).not.toContain("liff.line.me");
  });

  it("rewrites only the Account route for callers with their own href", () => {
    setContext({ current: "WORKSPACE", mini: false, workspace: "READY" });
    act(() => root.render(
      <LineAccountNavigationProvider accountLiffUrl={ACCOUNT_LIFF_URL}>
        <HrefProbe href="/line/account" />
        <HrefProbe href="#line-account-status" />
      </LineAccountNavigationProvider>,
    ));
    expect([...container.querySelectorAll("span")].map((node) => node.dataset.href)).toEqual([ACCOUNT_LIFF_URL, "#line-account-status"]);
  });
});

describe("LINE workspace navigation (Account -> Workspace)", () => {
  it("opens the Workspace LIFF URL from the Account LIFF", () => {
    setContext({ current: "ACCOUNT", mini: false, workspace: null });
    expect(workspaceLink(WORKSPACE_LIFF_URL)).toBe(WORKSPACE_LIFF_URL);
  });

  it("keeps /app in an ordinary browser, a MINI session and without Workspace configuration", () => {
    expect(workspaceLink(WORKSPACE_LIFF_URL)).toBe("/app");
    setContext({ current: "ACCOUNT", mini: true, workspace: null });
    expect(workspaceLink(WORKSPACE_LIFF_URL)).toBe("/app");
    setContext({ current: "ACCOUNT", mini: false, workspace: null });
    expect(workspaceLink(null)).toBe("/app");
    expect(workspaceLink("https://liff.line.me/1234567890-Workspace/app/admin")).toBe("/app");
  });
});
