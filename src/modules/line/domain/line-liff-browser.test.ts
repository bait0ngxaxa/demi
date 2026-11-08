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
  shouldInitializeWorkspaceLiff,
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

  it("ends a MINI navigation chain only on a real Workspace entry, and starts it again on the next MINI entry", () => {
    const shared = store();
    recordLiffBrowserEntry(shared, "MINI");
    // MINI -> Workspace LIFF URL in the same browsing session.
    recordLiffBrowserEntry(shared, "WORKSPACE");
    expect(readLiffBrowserContext(shared)).toEqual({ current: "WORKSPACE", mini: false, workspace: "PENDING" });
    expect(shouldInitializeWorkspaceLiff(readLiffBrowserContext(shared), "navigate")).toBe(true);
    recordWorkspaceInitResult(shared, "READY");
    expect(resolveLineAccountHref({ context: readLiffBrowserContext(shared), accountLiffUrl: ACCOUNT_LIFF_URL })).toBe(ACCOUNT_LIFF_URL);
    // Back into the MINI App: its exits are ordinary again and Workspace never initializes there.
    recordLiffBrowserEntry(shared, "MINI");
    expect(readLiffBrowserContext(shared)).toEqual({ current: "MINI", mini: true, workspace: "READY" });
    expect(shouldInitializeWorkspaceLiff(readLiffBrowserContext(shared), "reload")).toBe(false);
    // MINI -> Account keeps the chain: the Account screen's DEMI links stay /app.
    recordLiffBrowserEntry(shared, "ACCOUNT");
    expect(resolveLineWorkspaceHref({ context: readLiffBrowserContext(shared), workspaceLiffUrl: WORKSPACE_LIFF_URL })).toBe(LINE_WORKSPACE_WEB_PATH);
    expect(shouldInitializeWorkspaceLiff(readLiffBrowserContext(shared), "back_forward")).toBe(false);
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

  it("routes Workspace -> Account through the Account LIFF only from an initialized Workspace LIFF", () => {
    const ready = context({ current: "WORKSPACE", workspace: "READY" });
    expect(resolveLineAccountHref({ context: ready, accountLiffUrl: ACCOUNT_LIFF_URL })).toBe(ACCOUNT_LIFF_URL);
    for (const current of [
      null,
      context({ current: "WORKSPACE", workspace: "PENDING" }),
      context({ current: "WORKSPACE", workspace: "FAILED" }),
      context({ current: "ACCOUNT", workspace: "READY" }),
      context({ current: "MINI", mini: true }),
      context({ current: "WORKSPACE", mini: true, workspace: "READY" }),
    ]) {
      expect(resolveLineAccountHref({ context: current, accountLiffUrl: ACCOUNT_LIFF_URL })).toBe(LINE_ACCOUNT_PATH);
    }
    expect(resolveLineAccountHref({ context: ready, accountLiffUrl: null })).toBe(LINE_ACCOUNT_PATH);
    expect(resolveLineAccountHref({ context: ready, accountLiffUrl: "https://evil.example/line/account" })).toBe(LINE_ACCOUNT_PATH);
  });

  it("routes Account -> Workspace through the Workspace LIFF only from Account LIFF context", () => {
    expect(resolveLineWorkspaceHref({ context: context({ current: "ACCOUNT" }), workspaceLiffUrl: WORKSPACE_LIFF_URL })).toBe(WORKSPACE_LIFF_URL);
    for (const current of [null, context({ current: "WORKSPACE" }), context({ current: "ACCOUNT", mini: true }), context({ current: "MINI", mini: true })]) {
      expect(resolveLineWorkspaceHref({ context: current, workspaceLiffUrl: WORKSPACE_LIFF_URL })).toBe(LINE_WORKSPACE_WEB_PATH);
    }
    expect(resolveLineWorkspaceHref({ context: context({ current: "ACCOUNT" }), workspaceLiffUrl: null })).toBe(LINE_WORKSPACE_WEB_PATH);
    expect(resolveLineWorkspaceHref({ context: context({ current: "ACCOUNT" }), workspaceLiffUrl: "https://liff.line.me/1234567890-Workspace/app/admin" })).toBe(LINE_WORKSPACE_WEB_PATH);
  });

  it("never treats a pending or failed initialization as an initialized Workspace", () => {
    expect(isWorkspaceLiffContext(context({ current: "WORKSPACE", workspace: "READY" }))).toBe(true);
    expect(isWorkspaceLiffContext(context({ current: "WORKSPACE", workspace: "PENDING" }))).toBe(false);
    expect(isWorkspaceLiffContext(context({ current: "WORKSPACE", workspace: "FAILED" }))).toBe(false);
    expect(isWorkspaceLiffContext(context({ current: "WORKSPACE", mini: true, workspace: "READY" }))).toBe(false);
    expect(isWorkspaceLiffContext(context({ current: "ACCOUNT", workspace: "READY" }))).toBe(false);
    expect(isWorkspaceLiffContext(null)).toBe(false);
  });

  it("records init outcomes only for sessions with a Workspace entry", () => {
    const session = store();
    expect(recordWorkspaceInitResult(session, "READY")).toBe(false);
    expect(readLiffBrowserContext(session)).toBeNull();

    recordLiffBrowserEntry(session, "WORKSPACE");
    recordWorkspaceInitResult(session, "FAILED");
    expect(readLiffBrowserContext(session)).toEqual({ current: "WORKSPACE", mini: false, workspace: "FAILED" });

    // Workspace -> Account LIFF, then back to a Workspace page that initializes again.
    recordLiffBrowserEntry(session, "ACCOUNT");
    expect(readLiffBrowserContext(session)?.current).toBe("ACCOUNT");
    recordWorkspaceInitResult(session, "READY");
    expect(readLiffBrowserContext(session)).toEqual({ current: "WORKSPACE", mini: false, workspace: "READY" });

    const accountOnly = store();
    recordLiffBrowserEntry(accountOnly, "ACCOUNT");
    expect(recordWorkspaceInitResult(accountOnly, "READY")).toBe(false);
  });

  it("initializes Workspace after a real Workspace entry, or on back/reload of a Workspace page after the Account LIFF", () => {
    expect(shouldInitializeWorkspaceLiff(null, "navigate")).toBe(false);
    expect(shouldInitializeWorkspaceLiff(context({ current: "ACCOUNT" }), "reload")).toBe(false);
    expect(shouldInitializeWorkspaceLiff(context({ current: "MINI", mini: true }), "navigate")).toBe(false);
    expect(shouldInitializeWorkspaceLiff(context({ current: "WORKSPACE", mini: true, workspace: "PENDING" }), "navigate")).toBe(false);
    for (const workspace of ["PENDING", "READY", "FAILED"] as const) {
      for (const navigation of ["navigate", "reload", "back_forward", null] as const) {
        expect(shouldInitializeWorkspaceLiff(context({ current: "WORKSPACE", workspace }), navigation)).toBe(true);
      }
      // Back/Reload of a Workspace page after visiting the Account LIFF.
      expect(shouldInitializeWorkspaceLiff(context({ current: "ACCOUNT", workspace }), "back_forward")).toBe(true);
      expect(shouldInitializeWorkspaceLiff(context({ current: "ACCOUNT", workspace }), "reload")).toBe(true);
      // A plain new navigation from the Account LIFF (e.g. its header logo before this fix) is not a Workspace entry.
      expect(shouldInitializeWorkspaceLiff(context({ current: "ACCOUNT", workspace }), "navigate")).toBe(false);
      expect(shouldInitializeWorkspaceLiff(context({ current: "ACCOUNT", workspace }), null)).toBe(false);
    }
  });

  it("never stores anything that could read as an authentication or authorization grant", () => {
    const session = store();
    recordLiffBrowserEntry(session, "WORKSPACE");
    recordWorkspaceInitResult(session, "READY");
    expect(Object.keys(readLiffBrowserContext(session) ?? {}).sort()).toEqual(["current", "mini", "workspace"]);
    expect(session.getItem(LIFF_BROWSER_CONTEXT_KEY)).not.toMatch(/token|user|role|session|patient|hospital/iu);
  });
});
