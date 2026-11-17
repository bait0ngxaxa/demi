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
  recordWorkspaceInitResult,
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
  ({ workspace: null, ...value });

describe("LIFF browser context (presentation only)", () => {
  it("records entries per LIFF app and starts Workspace as pending", () => {
    const session = store();
    expect(readLiffBrowserContext(session)).toBeNull();
    recordLiffBrowserEntry(session, "WORKSPACE");
    expect(readLiffBrowserContext(session)).toEqual({ current: "WORKSPACE", workspace: "PENDING" });
    recordLiffBrowserEntry(session, "ACCOUNT");
    expect(readLiffBrowserContext(session)).toEqual({ current: "ACCOUNT", workspace: "PENDING" });

    const accountFirst = store();
    recordLiffBrowserEntry(accountFirst, "ACCOUNT");
    expect(readLiffBrowserContext(accountFirst)).toEqual({ current: "ACCOUNT", workspace: null });
  });

  it.each([
    ["Workspace-ready", { current: "WORKSPACE", mini: false, workspace: "READY" }],
    ["Account", { current: "ACCOUNT", mini: false, workspace: "READY" }],
    ["sticky session", { current: "ACCOUNT", mini: true, workspace: null }],
    ["retired app", { current: "MINI", mini: true, workspace: "READY" }],
    ["retired app without the old field", { current: "MINI", workspace: "READY" }],
  ])("treats a value stored before ADR-0035 (%s) as no context, never as Workspace-ready", (_label, legacy) => {
    const session = store({ [LIFF_BROWSER_CONTEXT_KEY]: JSON.stringify(legacy) });
    expect(readLiffBrowserContext(session)).toBeNull();
    expect(isWorkspaceLiffContext(readLiffBrowserContext(session))).toBe(false);
    expect(resolveLineAccountHref({ context: readLiffBrowserContext(session), accountLiffUrl: ACCOUNT_LIFF_URL })).toBe(LINE_ACCOUNT_PATH);
    expect(resolveLineWorkspaceHref({ context: readLiffBrowserContext(session), workspaceLiffUrl: WORKSPACE_LIFF_URL })).toBe(LINE_WORKSPACE_WEB_PATH);
    // An init result cannot promote it; the next real entry rewrites it in the current shape.
    expect(recordWorkspaceInitResult(session, "READY")).toBe(false);
    recordLiffBrowserEntry(session, "WORKSPACE");
    expect(readLiffBrowserContext(session)).toEqual({ current: "WORKSPACE", workspace: "PENDING" });
  });

  it.each([
    "not json",
    JSON.stringify({ current: "ADMIN", workspace: null }),
    JSON.stringify({ current: "WORKSPACE" }),
    JSON.stringify({ current: "WORKSPACE", workspace: "AUTHORIZED" }),
    JSON.stringify({ current: "WORKSPACE", workspace: "READY", role: "ADMIN" }),
    JSON.stringify({ current: "WORKSPACE", workspace: null, padding: "x".repeat(300) }),
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

  it("routes Workspace -> Account through the Account LIFF only from an initialized Workspace LIFF", () => {
    const ready = context({ current: "WORKSPACE", workspace: "READY" });
    expect(resolveLineAccountHref({ context: ready, accountLiffUrl: ACCOUNT_LIFF_URL })).toBe(ACCOUNT_LIFF_URL);
    for (const current of [
      null,
      context({ current: "WORKSPACE", workspace: "PENDING" }),
      context({ current: "WORKSPACE", workspace: "FAILED" }),
      context({ current: "ACCOUNT", workspace: "READY" }),
    ]) {
      expect(resolveLineAccountHref({ context: current, accountLiffUrl: ACCOUNT_LIFF_URL })).toBe(LINE_ACCOUNT_PATH);
    }
    expect(resolveLineAccountHref({ context: ready, accountLiffUrl: null })).toBe(LINE_ACCOUNT_PATH);
    expect(resolveLineAccountHref({ context: ready, accountLiffUrl: "https://evil.example/line/account" })).toBe(LINE_ACCOUNT_PATH);
  });

  it("routes Account -> Workspace through the Workspace LIFF only from Account LIFF context", () => {
    expect(resolveLineWorkspaceHref({ context: context({ current: "ACCOUNT" }), workspaceLiffUrl: WORKSPACE_LIFF_URL })).toBe(WORKSPACE_LIFF_URL);
    for (const current of [null, context({ current: "WORKSPACE" }), context({ current: "WORKSPACE", workspace: "READY" })]) {
      expect(resolveLineWorkspaceHref({ context: current, workspaceLiffUrl: WORKSPACE_LIFF_URL })).toBe(LINE_WORKSPACE_WEB_PATH);
    }
    expect(resolveLineWorkspaceHref({ context: context({ current: "ACCOUNT" }), workspaceLiffUrl: null })).toBe(LINE_WORKSPACE_WEB_PATH);
    expect(resolveLineWorkspaceHref({ context: context({ current: "ACCOUNT" }), workspaceLiffUrl: "https://liff.line.me/1234567890-Workspace/app/admin" })).toBe(LINE_WORKSPACE_WEB_PATH);
  });

  it("never treats a pending or failed initialization as an initialized Workspace", () => {
    expect(isWorkspaceLiffContext(context({ current: "WORKSPACE", workspace: "READY" }))).toBe(true);
    expect(isWorkspaceLiffContext(context({ current: "WORKSPACE", workspace: "PENDING" }))).toBe(false);
    expect(isWorkspaceLiffContext(context({ current: "WORKSPACE", workspace: "FAILED" }))).toBe(false);
    expect(isWorkspaceLiffContext(context({ current: "ACCOUNT", workspace: "READY" }))).toBe(false);
    expect(isWorkspaceLiffContext(null)).toBe(false);
  });

  it("records init outcomes only for sessions with a Workspace entry", () => {
    const session = store();
    expect(recordWorkspaceInitResult(session, "READY")).toBe(false);
    expect(readLiffBrowserContext(session)).toBeNull();

    recordLiffBrowserEntry(session, "WORKSPACE");
    recordWorkspaceInitResult(session, "FAILED");
    expect(readLiffBrowserContext(session)).toEqual({ current: "WORKSPACE", workspace: "FAILED" });

    // Workspace -> Account LIFF, then back to a Workspace page that initializes again.
    recordLiffBrowserEntry(session, "ACCOUNT");
    expect(readLiffBrowserContext(session)?.current).toBe("ACCOUNT");
    recordWorkspaceInitResult(session, "READY");
    expect(readLiffBrowserContext(session)).toEqual({ current: "WORKSPACE", workspace: "READY" });

    const accountOnly = store();
    recordLiffBrowserEntry(accountOnly, "ACCOUNT");
    expect(recordWorkspaceInitResult(accountOnly, "READY")).toBe(false);
  });

  it("never stores anything that could read as an authentication or authorization grant", () => {
    const session = store();
    recordLiffBrowserEntry(session, "WORKSPACE");
    recordWorkspaceInitResult(session, "READY");
    expect(Object.keys(readLiffBrowserContext(session) ?? {}).sort()).toEqual(["current", "workspace"]);
    expect(session.getItem(LIFF_BROWSER_CONTEXT_KEY)).not.toMatch(/token|user|role|session|patient|hospital/iu);
  });
});
