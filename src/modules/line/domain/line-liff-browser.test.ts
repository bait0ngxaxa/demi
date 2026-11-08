import { describe, expect, it } from "vitest";

import {
  isAccountLiffUrl,
  isLiffBrowserUserAgent,
  isWorkspaceLiffContext,
  LINE_ACCOUNT_PATH,
  markWorkspaceLiffContext,
  resolveLineAccountHref,
  WORKSPACE_LIFF_CONTEXT_KEY,
} from "./line-liff-browser";

// Synthetic user agents shaped after the SDK pattern; real-device user agents are checked in UAT.
const LIFF_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.19.0 LIFF";
const LINE_IN_APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.19.0";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function store(initial: Record<string, string> = {}): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe("LIFF browser context (presentation only)", () => {
  it("recognizes the LIFF browser user agent the SDK recognizes, not LINE's ordinary in-app browser", () => {
    expect(isLiffBrowserUserAgent(LIFF_IOS)).toBe(true);
    expect(isLiffBrowserUserAgent(LINE_IN_APP)).toBe(false);
    expect(isLiffBrowserUserAgent(CHROME)).toBe(false);
    expect(isLiffBrowserUserAgent("Mozilla/5.0 Line/14.19.1 LIFF")).toBe(true);
  });

  it("is Workspace context only in a LIFF browser session the Workspace entry marked", () => {
    const marked = store();
    markWorkspaceLiffContext(marked);
    expect(marked.getItem(WORKSPACE_LIFF_CONTEXT_KEY)).toBe("1");
    expect(isWorkspaceLiffContext({ userAgent: LIFF_IOS, store: marked })).toBe(true);
    // MINI App / Account LIFF browser that navigates into /app: LIFF browser but never marked.
    expect(isWorkspaceLiffContext({ userAgent: LIFF_IOS, store: store() })).toBe(false);
    // A copied marker in an ordinary browser is not Workspace context.
    expect(isWorkspaceLiffContext({ userAgent: CHROME, store: marked })).toBe(false);
    expect(isWorkspaceLiffContext({ userAgent: LIFF_IOS, store: null })).toBe(false);
    expect(isWorkspaceLiffContext({ userAgent: LIFF_IOS, store: { getItem: () => { throw new Error("denied"); } } })).toBe(false);
  });

  it("accepts only the exact Account LIFF URL shape as a LIFF transition target", () => {
    expect(isAccountLiffUrl("https://liff.line.me/1234567890-Account")).toBe(true);
    for (const value of [
      null,
      "",
      "/line/account",
      "https://liff.line.me/1234567890-Account/app",
      "https://liff.line.me/1234567890-Account?liff.state=/app",
      "https://liff.line.me/1234567890-Account#access_token=x",
      "http://liff.line.me/1234567890-Account",
      "https://liff.line.me.evil.example/1234567890-Account",
      "https://evil.example/1234567890-Account",
      "javascript:alert(1)",
    ]) {
      expect(isAccountLiffUrl(value)).toBe(false);
    }
  });

  it("routes Account navigation to the Account LIFF only from Workspace LIFF context", () => {
    const accountLiffUrl = "https://liff.line.me/1234567890-Account";
    expect(resolveLineAccountHref({ workspaceLiffContext: true, accountLiffUrl })).toBe(accountLiffUrl);
    expect(resolveLineAccountHref({ workspaceLiffContext: false, accountLiffUrl })).toBe(LINE_ACCOUNT_PATH);
    // Missing configuration fails safe to the ordinary route.
    expect(resolveLineAccountHref({ workspaceLiffContext: true, accountLiffUrl: null })).toBe(LINE_ACCOUNT_PATH);
    // An arbitrary destination can never be produced.
    expect(resolveLineAccountHref({ workspaceLiffContext: true, accountLiffUrl: "https://evil.example/line/account" })).toBe(LINE_ACCOUNT_PATH);
  });
});
