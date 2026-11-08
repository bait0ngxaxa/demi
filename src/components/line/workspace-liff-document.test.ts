// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { consumeWorkspaceLiffHandoff, isWorkspaceLiffHistoryEntry, markWorkspaceLiffHistoryEntry, prepareWorkspaceLiffHandoff } from "./workspace-liff-document";
import { getCurrentDocumentLiffApp, recordCurrentLiffBrowserEntry } from "./liff-browser-context-store";

const ID = "1234567890-Workspace";
const PATH = "/app/patients/assigned?task=screening";

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", PATH);
});

describe("Workspace document ownership (transport only)", () => {
  it("consumes a matching one-shot primary/secondary handoff without altering LINE parameters", () => {
    prepareWorkspaceLiffHandoff(ID, PATH);
    window.history.replaceState(null, "", `${PATH}&liff.hback=2&lineAppVersion=14.19.1`);
    expect(consumeWorkspaceLiffHandoff(ID)).toBe(true);
    expect(consumeWorkspaceLiffHandoff(ID)).toBe(false);
    expect(window.location.search).toContain("liff.hback=2");
    expect(window.location.search).toContain("lineAppVersion=14.19.1");
  });

  it.each(["/app", "/app/patients/assigned?task=screening&task=screening", "/app/patients/assigned?task=%73creening"])("consumes and rejects mismatched handoff to %s", (path) => {
    prepareWorkspaceLiffHandoff(ID, PATH);
    window.history.replaceState(null, "", path);
    expect(consumeWorkspaceLiffHandoff(ID)).toBe(false);
    window.history.replaceState(null, "", PATH);
    expect(consumeWorkspaceLiffHandoff(ID)).toBe(false);
  });

  it("rejects expired, different-LIFF, corrupted, missing and inaccessible storage", () => {
    prepareWorkspaceLiffHandoff(ID, PATH);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_001);
    expect(consumeWorkspaceLiffHandoff(ID)).toBe(false);
    vi.restoreAllMocks();
    prepareWorkspaceLiffHandoff(ID, PATH);
    expect(consumeWorkspaceLiffHandoff("1234567890-Account")).toBe(false);
    window.sessionStorage.setItem("demi.line.workspace.handoff", "{broken");
    expect(consumeWorkspaceLiffHandoff(ID)).toBe(false);
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => { throw new Error("denied"); });
    expect(() => prepareWorkspaceLiffHandoff(ID, PATH)).not.toThrow();
    expect(consumeWorkspaceLiffHandoff(ID)).toBe(false);
    vi.restoreAllMocks();
  });

  it("rejects arbitrary return destinations", () => {
    for (const path of ["https://evil.invalid/app", "//evil.invalid", "/line/account", "/app/admin"]) {
      prepareWorkspaceLiffHandoff(ID, path);
      expect(window.sessionStorage.getItem("demi.line.workspace.handoff")).toBeNull();
    }
  });

  it("Account and MINI entries invalidate an unconsumed Workspace handoff", () => {
    for (const app of ["ACCOUNT", "MINI"] as const) {
      prepareWorkspaceLiffHandoff(ID, PATH);
      recordCurrentLiffBrowserEntry(app);
      expect(getCurrentDocumentLiffApp()).toBe(app);
      expect(consumeWorkspaceLiffHandoff(ID)).toBe(false);
    }
  });

  it("unavailable history storage neither identifies Workspace nor prevents web fallback", () => {
    vi.spyOn(window.history, "state", "get").mockImplementation(() => { throw new Error("denied"); });
    expect(isWorkspaceLiffHistoryEntry(ID)).toBe(false);
    expect(() => markWorkspaceLiffHistoryEntry(ID)).not.toThrow();
  });

  it("restores only a history entry marked after actual document initialization", () => {
    window.sessionStorage.setItem("demi.line.liff.context", JSON.stringify({ current: "ACCOUNT", mini: false, workspace: "READY" }));
    expect(isWorkspaceLiffHistoryEntry(ID)).toBe(false);
    window.history.replaceState({ __NA: true, tree: "Next-owned" }, "");
    markWorkspaceLiffHistoryEntry(ID);
    expect(isWorkspaceLiffHistoryEntry(ID)).toBe(true);
    expect(window.history.state.tree).toBe("Next-owned");
    const workspaceEntry: unknown = window.history.state;
    // A new ordinary entry from Account contains no Workspace mark, even on reload/back-forward.
    window.history.replaceState({ __NA: true }, "");
    expect(isWorkspaceLiffHistoryEntry(ID)).toBe(false);
    window.history.replaceState(workspaceEntry, "");
    expect(isWorkspaceLiffHistoryEntry(ID)).toBe(true);
    expect(isWorkspaceLiffHistoryEntry("1234567890-Account")).toBe(false);
  });
});
