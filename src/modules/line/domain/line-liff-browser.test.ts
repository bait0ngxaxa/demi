import { describe, expect, it } from "vitest";

import {
  isAccountLiffUrl,
  isWorkspaceLiffContext,
  isWorkspaceLiffUrl,
  LIFF_BROWSER_CONTEXT_KEY,
  LINE_ACCOUNT_PATH,
  LINE_WORKSPACE_WEB_PATH,
  readLiffBrowserContext,
  recordLiffBrowserEntry,
  resolveLineAccountHref,
  resolveLineWorkspaceHref,
  type LiffBrowserContext,
} from "./line-liff-browser";

const ACCOUNT_LIFF_URL = "https://liff.line.me/1234567890-Account";
const WORKSPACE_LIFF_URL = "https://liff.line.me/1234567890-Workspace/app";

function store(initial: Record<string, string> = {}): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

const context = (value: Partial<LiffBrowserContext> & Pick<LiffBrowserContext, "current">): LiffBrowserContext =>
  ({ mini: false, workspace: null, ...value });

describe("LIFF browser context (presentation only)", () => {
  it("records entries per LIFF app, keeps the MINI session sticky and starts Workspace as pending", () => {
    const session = store();
    expect(readLiffBrowserContext(session)).toBeNull();
    recordLiffBrowserEntry(session, "WORKSPACE");
    expect(readLiffBrowserContext(session)).toEqual({ current: "WORKSPACE", mini: false, workspace: "PENDING" });
    recordLiffBrowserEntry(session, "ACCOUNT");
    expect(readLiffBrowserContext(session)).toEqual({ current: "ACCOUNT", mini: false, workspace: "PENDING" });

    const mini = store();
    recordLiffBrowserEntry(mini, "MINI");
    recordLiffBrowserEntry(mini, "ACCOUNT");
    expect(readLiffBrowserContext(mini)).toEqual({ current: "ACCOUNT", mini: true, workspace: null });
  });

  it.each([
    "not json",
    JSON.stringify({ current: "ADMIN", mini: false, workspace: null }),
    JSON.stringify({ current: "WORKSPACE", mini: "no", workspace: null }),
    JSON.stringify({ current: "WORKSPACE", mini: false, workspace: "AUTHORIZED" }),
    JSON.stringify({ current: "WORKSPACE", mini: false, workspace: null, padding: "x".repeat(300) }),
  ])("treats malformed stored context %s as no context", (raw) => {
    expect(readLiffBrowserContext(store({ [LIFF_BROWSER_CONTEXT_KEY]: raw }))).toBeNull();
  });

  it("tolerates unavailable storage", () => {
    const denied = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(readLiffBrowserContext(denied)).toBeNull();
    expect(recordLiffBrowserEntry(denied, "WORKSPACE")).toBe(false);
    expect(recordLiffBrowserEntry(null, "WORKSPACE")).toBe(false);
  });

  it("accepts only the exact Account and Workspace LIFF URL shapes", () => {
    expect(isAccountLiffUrl(ACCOUNT_LIFF_URL)).toBe(true);
    expect(isWorkspaceLiffUrl(WORKSPACE_LIFF_URL)).toBe(true);
    for (const value of [
      null, "", "/line/account", "/app",
      "https://liff.line.me/1234567890-Account/app/admin",
      "https://liff.line.me/1234567890-Account?liff.state=/app",
      "https://liff.line.me/1234567890-Account#access_token=x",
      "http://liff.line.me/1234567890-Account",
      "https://liff.line.me.evil.example/1234567890-Account",
      "https://evil.example/1234567890-Account",
      "javascript:alert(1)",
    ]) {
      expect(isAccountLiffUrl(value)).toBe(false);
      expect(isWorkspaceLiffUrl(value)).toBe(false);
    }
    expect(isWorkspaceLiffUrl(ACCOUNT_LIFF_URL)).toBe(false);
    expect(isAccountLiffUrl(WORKSPACE_LIFF_URL)).toBe(false);
  });

  it("routes Workspace -> Account through the Account LIFF only from Workspace LIFF context", () => {
    expect(resolveLineAccountHref({ context: context({ current: "WORKSPACE" }), accountLiffUrl: ACCOUNT_LIFF_URL })).toBe(ACCOUNT_LIFF_URL);
    for (const current of [null, context({ current: "ACCOUNT" }), context({ current: "MINI", mini: true }), context({ current: "WORKSPACE", mini: true })]) {
      expect(resolveLineAccountHref({ context: current, accountLiffUrl: ACCOUNT_LIFF_URL })).toBe(LINE_ACCOUNT_PATH);
    }
    expect(resolveLineAccountHref({ context: context({ current: "WORKSPACE" }), accountLiffUrl: null })).toBe(LINE_ACCOUNT_PATH);
    expect(resolveLineAccountHref({ context: context({ current: "WORKSPACE" }), accountLiffUrl: "https://evil.example/line/account" })).toBe(LINE_ACCOUNT_PATH);
  });

  it("routes Account -> Workspace through the Workspace LIFF only from Account LIFF context", () => {
    expect(resolveLineWorkspaceHref({ context: context({ current: "ACCOUNT" }), workspaceLiffUrl: WORKSPACE_LIFF_URL })).toBe(WORKSPACE_LIFF_URL);
    for (const current of [null, context({ current: "WORKSPACE" }), context({ current: "ACCOUNT", mini: true }), context({ current: "MINI", mini: true })]) {
      expect(resolveLineWorkspaceHref({ context: current, workspaceLiffUrl: WORKSPACE_LIFF_URL })).toBe(LINE_WORKSPACE_WEB_PATH);
    }
    expect(resolveLineWorkspaceHref({ context: context({ current: "ACCOUNT" }), workspaceLiffUrl: null })).toBe(LINE_WORKSPACE_WEB_PATH);
    expect(resolveLineWorkspaceHref({ context: context({ current: "ACCOUNT" }), workspaceLiffUrl: "https://liff.line.me/1234567890-Workspace/app/admin" })).toBe(LINE_WORKSPACE_WEB_PATH);
  });

  it("is Workspace context only for a non-MINI session whose current app is Workspace", () => {
    expect(isWorkspaceLiffContext(context({ current: "WORKSPACE" }))).toBe(true);
    expect(isWorkspaceLiffContext(context({ current: "WORKSPACE", mini: true }))).toBe(false);
    expect(isWorkspaceLiffContext(context({ current: "ACCOUNT" }))).toBe(false);
    expect(isWorkspaceLiffContext(null)).toBe(false);
  });
});
