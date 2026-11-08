import { describe, expect, it } from "vitest";

import { isLineQuickActionLoginReturnTo } from "@/modules/auth/schemas/login-schema";

import {
  isWorkspaceLiffContext,
  LINE_ACCOUNT_PATH,
  LINE_WORKSPACE_WEB_PATH,
  readLiffBrowserContext,
  recordLiffBrowserEntry,
  recordWorkspaceInitResult,
  resolveLineAccountHref,
  resolveLineWorkspaceHref,
  shouldInitializeWorkspaceLiff,
} from "./line-liff-browser";
import { classifyLineWorkflowEntry, getLineQuickActionReturnPathFromUrl } from "./line-navigation-intents";
import { classifyLineWorkspaceLiffEntry } from "./line-workspace-liff-entry";

/**
 * Cross-module regression of both PR #2 remediation rounds, walking the
 * browser-session journeys step by step with an in-memory session store. This
 * is DEMI's contract with mocked platform behavior; LINE WebView behavior is
 * verified only by LINE_WORKSPACE_LIFF_UAT on real devices.
 */
const ORIGIN = "https://demi.example.org";
const ACCOUNT_LIFF_URL = "https://liff.line.me/1234567890-Account";
const WORKSPACE_LIFF_URL = "https://liff.line.me/1234567890-Workspace/app";

function session(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe("Workspace LIFF lifecycle regression", () => {
  it("Rich Menu medication -> primary redirect -> secondary redirect -> DEMI login -> Account LIFF -> back", () => {
    const store = session();
    // Primary redirect at / on Android: platform parameters are accepted, the destination is allowlisted.
    expect(classifyLineWorkspaceLiffEntry({ "liff.state": "/app/personal/medications", lineAppVersion: "14.19.1" }))
      .toEqual({ status: "LIFF", destination: "/app/personal/medications" });
    recordLiffBrowserEntry(store, "WORKSPACE");
    // Account links stay ordinary until Workspace init succeeds.
    expect(resolveLineAccountHref({ context: readLiffBrowserContext(store), accountLiffUrl: ACCOUNT_LIFF_URL })).toBe(LINE_ACCOUNT_PATH);

    // Secondary redirect after an in-LINE login keeps the approved login return.
    const secondary = new URL("/app/personal/medications?liff.hback=2&lineAppVersion=14.19.1", ORIGIN);
    expect(getLineQuickActionReturnPathFromUrl(secondary)).toBe("/app/personal/medications");
    expect(isLineQuickActionLoginReturnTo("/app/personal/medications")).toBe(true);
    expect(shouldInitializeWorkspaceLiff(readLiffBrowserContext(store), "navigate")).toBe(true);
    recordWorkspaceInitResult(store, "READY");
    expect(isWorkspaceLiffContext(readLiffBrowserContext(store))).toBe(true);
    expect(resolveLineAccountHref({ context: readLiffBrowserContext(store), accountLiffUrl: ACCOUNT_LIFF_URL })).toBe(ACCOUNT_LIFF_URL);

    // Workspace -> Account LIFF: the Account page records its own entry.
    recordLiffBrowserEntry(store, "ACCOUNT");
    expect(isWorkspaceLiffContext(readLiffBrowserContext(store))).toBe(false);
    expect(resolveLineWorkspaceHref({ context: readLiffBrowserContext(store), workspaceLiffUrl: WORKSPACE_LIFF_URL })).toBe(WORKSPACE_LIFF_URL);

    // A plain navigation from the Account LIFF into /app is not a Workspace entry.
    expect(shouldInitializeWorkspaceLiff(readLiffBrowserContext(store), "navigate")).toBe(false);
    // Back to a Workspace page (back/forward or reload): it initializes again and becomes current.
    expect(shouldInitializeWorkspaceLiff(readLiffBrowserContext(store), "back_forward")).toBe(true);
    recordWorkspaceInitResult(store, "READY");
    expect(readLiffBrowserContext(store)).toEqual({ current: "WORKSPACE", mini: false, workspace: "READY" });
  });

  it("a failed Workspace init never reads as initialized and keeps ordinary Account links", () => {
    const store = session();
    recordLiffBrowserEntry(store, "WORKSPACE");
    recordWorkspaceInitResult(store, "FAILED");
    expect(isWorkspaceLiffContext(readLiffBrowserContext(store))).toBe(false);
    expect(resolveLineAccountHref({ context: readLiffBrowserContext(store), accountLiffUrl: ACCOUNT_LIFF_URL })).toBe(LINE_ACCOUNT_PATH);
    // The next document may try again (manual reload), still with the Workspace ID only.
    expect(shouldInitializeWorkspaceLiff(readLiffBrowserContext(store), "reload")).toBe(true);
  });

  it("MINI App: Account and Workspace links keep the approved ordinary exits and Workspace never initializes", () => {
    const store = session();
    expect(classifyLineWorkflowEntry({ "liff.state": "?intent=OPEN_PATIENT_APPOINTMENTS" })).toEqual({ status: "VALID", intent: "OPEN_PATIENT_APPOINTMENTS" });
    recordLiffBrowserEntry(store, "MINI");
    recordLiffBrowserEntry(store, "ACCOUNT");
    const context = readLiffBrowserContext(store);
    expect(resolveLineWorkspaceHref({ context, workspaceLiffUrl: WORKSPACE_LIFF_URL })).toBe(LINE_WORKSPACE_WEB_PATH);
    expect(resolveLineAccountHref({ context, accountLiffUrl: ACCOUNT_LIFF_URL })).toBe(LINE_ACCOUNT_PATH);
    expect(shouldInitializeWorkspaceLiff(context, "navigate")).toBe(false);
    expect(getLineQuickActionReturnPathFromUrl(new URL("/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS&liff.hback=2", ORIGIN))).toBeNull();
  });

  it("ordinary browsers: no context, ordinary routes, exact login returns", () => {
    expect(classifyLineWorkspaceLiffEntry({})).toEqual({ status: "ORDINARY" });
    expect(resolveLineAccountHref({ context: null, accountLiffUrl: ACCOUNT_LIFF_URL })).toBe(LINE_ACCOUNT_PATH);
    expect(resolveLineWorkspaceHref({ context: null, workspaceLiffUrl: WORKSPACE_LIFF_URL })).toBe(LINE_WORKSPACE_WEB_PATH);
    expect(shouldInitializeWorkspaceLiff(null, "navigate")).toBe(false);
    expect(getLineQuickActionReturnPathFromUrl(new URL("/app/patients/assigned?task=screening", ORIGIN))).toBe("/app/patients/assigned?task=screening");
  });

  it("the strict navigation allowlist still holds next to accepted platform parameters", () => {
    for (const state of ["/line/account", "//evil.example/app", "/app/%2e%2e/line/account", "/app/personal?liff.hback=2"]) {
      expect(classifyLineWorkspaceLiffEntry({ "liff.state": state, lineAppVersion: "14.19.1", "liff.newFlag": "1" })).toEqual({ status: "NAVIGATION_INVALID" });
    }
    expect(getLineQuickActionReturnPathFromUrl(new URL("/app/personal?liff.hback=2&returnTo=https%3A%2F%2Fevil.example", ORIGIN))).toBeNull();
  });
});
