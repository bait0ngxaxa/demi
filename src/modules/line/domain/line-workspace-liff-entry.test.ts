import { describe, expect, it } from "vitest";

import { LINE_WEB_NAVIGATION_PATHS } from "./line-navigation-intents";
import {
  classifyLineWorkspaceLiffEntry,
  hasLiffCredentialFragment,
  LINE_WORKSPACE_LIFF_DESTINATIONS,
  resolveWorkspaceLiffDestination,
} from "./line-workspace-liff-entry";

describe("Workspace LIFF root entry classification", () => {
  it("keeps ordinary browser requests for / ordinary", () => {
    expect(classifyLineWorkspaceLiffEntry({})).toEqual({ status: "ORDINARY" });
    expect(classifyLineWorkspaceLiffEntry({ utm_source: "poster" })).toEqual({ status: "ORDINARY" });
    expect(classifyLineWorkspaceLiffEntry({ returnTo: "https://evil.example" })).toEqual({ status: "ORDINARY" });
  });

  it("allows exactly the fixed operational destinations", () => {
    expect(LINE_WORKSPACE_LIFF_DESTINATIONS).toEqual([...new Set(Object.values(LINE_WEB_NAVIGATION_PATHS))]);
    expect(LINE_WORKSPACE_LIFF_DESTINATIONS).toContain("/app");
    expect(LINE_WORKSPACE_LIFF_DESTINATIONS).not.toContain("/line/account");
    expect(LINE_WORKSPACE_LIFF_DESTINATIONS).not.toContain("/line/workflow");
  });

  it.each(LINE_WORKSPACE_LIFF_DESTINATIONS)("accepts the primary redirect for %s", (path) => {
    expect(classifyLineWorkspaceLiffEntry({ "liff.state": path })).toEqual({ status: "LIFF", destination: path });
  });

  it("accepts the screening task query carried inside liff.state", () => {
    expect(classifyLineWorkspaceLiffEntry({ "liff.state": "/app/patients/assigned?task=screening" }))
      .toEqual({ status: "LIFF", destination: "/app/patients/assigned?task=screening" });
    expect(classifyLineWorkspaceLiffEntry({ "liff.state": "app/personal" }))
      .toEqual({ status: "LIFF", destination: "/app/personal" });
  });

  it("accepts a LINE login return and the secondary-redirect bookkeeping parameters", () => {
    expect(classifyLineWorkspaceLiffEntry({
      "liff.state": "/app/personal/wellness",
      "liff.hback": "2",
      code: "synthetic-code",
      state: "synthetic-state",
      liffClientId: "1234567890",
      liffRedirectUri: "https://demi.example.org/?liff.state=%2Fapp%2Fpersonal%2Fwellness",
    })).toEqual({ status: "LIFF", destination: "/app/personal/wellness" });
    expect(classifyLineWorkspaceLiffEntry({ "liff.state": "" })).toEqual({ status: "LIFF", destination: null });
    expect(classifyLineWorkspaceLiffEntry({ "liff.referrer": "https://line.me" })).toEqual({ status: "LIFF", destination: null });
  });

  it.each([
    [{ "liff.state": "https://evil.example/app" }],
    [{ "liff.state": "//evil.example/app" }],
    [{ "liff.state": "/app/../line/account" }],
    [{ "liff.state": "/line/account" }],
    [{ "liff.state": "/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS" }],
    [{ "liff.state": "/app/patients/assigned?task=screening&returnTo=https://evil.example" }],
    [{ "liff.state": "/app/hospitals/11111111-1111-4111-8111-111111111111" }],
    [{ "liff.state": "/app/personal#access_token=leak" }],
    [{ "liff.state": ["/app", "/app"] }],
    [{ "liff.state": "/app", returnTo: "/app/personal" }],
    [{ "liff.state": "/app", patientId: "11111111-1111-4111-8111-111111111111" }],
    [{ code: "x".repeat(2049) }],
  ])("rejects untrusted LIFF navigation %j before the SDK could follow it", (query) => {
    expect(classifyLineWorkspaceLiffEntry(query)).toEqual({ status: "NAVIGATION_INVALID" });
  });

  describe("LINE platform parameter compatibility", () => {
    it("accepts the Android lineAppVersion parameter on a primary redirect and on a bare launch", () => {
      expect(classifyLineWorkspaceLiffEntry({ "liff.state": "/app/personal/medications", lineAppVersion: "14.19.1" }))
        .toEqual({ status: "LIFF", destination: "/app/personal/medications" });
      expect(classifyLineWorkspaceLiffEntry({ lineAppVersion: "14.19.1" })).toEqual({ status: "LIFF", destination: null });
    });

    it("accepts liff.referrer from a LIFF-to-LIFF transition without treating it as navigation", () => {
      expect(classifyLineWorkspaceLiffEntry({ "liff.state": "/app", "liff.referrer": "https://liff.line.me/1234567890-Account" }))
        .toEqual({ status: "LIFF", destination: "/app" });
      expect(classifyLineWorkspaceLiffEntry({ "liff.referrer": "https://evil.example/app/personal" }))
        .toEqual({ status: "LIFF", destination: null });
    });

    it("accepts additional liff.* parameters LINE may introduce, without expanding the destination allowlist", () => {
      expect(classifyLineWorkspaceLiffEntry({ "liff.state": "/app/personal", "liff.futureFlag": "1", "liff.hback": "2" }))
        .toEqual({ status: "LIFF", destination: "/app/personal" });
      expect(classifyLineWorkspaceLiffEntry({ "liff.destination": "/line/account" })).toEqual({ status: "LIFF", destination: null });
    });

    it("accepts every LINE Login return marker together with the original liff.state", () => {
      expect(classifyLineWorkspaceLiffEntry({
        "liff.state": "/app/patients/assigned?task=screening",
        "liff.hback": "2",
        lineAppVersion: "14.19.1",
        code: "synthetic-code",
        state: "synthetic-state",
        liffClientId: "1234567890",
        liffRedirectUri: "https://demi.example.org/?liff.state=%2Fapp",
        liffIsEscapedFromApp: "true",
      })).toEqual({ status: "LIFF", destination: "/app/patients/assigned?task=screening" });
    });

    it("tolerates repeated bookkeeping parameters but never a repeated liff.state", () => {
      expect(classifyLineWorkspaceLiffEntry({ "liff.state": "/app", "liff.hback": ["2", "2"] })).toEqual({ status: "LIFF", destination: "/app" });
      expect(classifyLineWorkspaceLiffEntry({ "liff.state": ["/app", "/app/personal"] })).toEqual({ status: "NAVIGATION_INVALID" });
    });

    it.each([
      ["unknown application parameter", { "liff.state": "/app", next: "/app/personal" }],
      ["unbounded liff.* name", { "liff.state": "/app", [`liff.${"a".repeat(40)}`]: "1" }],
      ["liff-like name without the dot", { "liff.state": "/app", liffstate: "/app/personal" }],
      ["lineAppVersion lookalike", { "liff.state": "/app", LineAppVersion: "1" }],
      ["oversized platform value", { "liff.state": "/app", lineAppVersion: "1".repeat(2049) }],
      ["oversized navigation value", { "liff.state": `/app/personal?${"a".repeat(300)}` }],
      ["too many parameters", Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`liff.p${index}`, "1"]))],
      ["too many repeated values", { "liff.state": "/app", "liff.hback": Array.from({ length: 25 }, () => "2") }],
      ["encoded traversal", { "liff.state": "/app/%2e%2e/line/account" }],
      ["encoded slash", { "liff.state": "/app%2Fpersonal" }],
      ["double-encoded destination", { "liff.state": "%2Fapp%2Fpersonal" }],
      ["backslash host", { "liff.state": "/\\evil.example/app" }],
      ["protocol-relative", { "liff.state": "//evil.example/app/personal" }],
      ["external", { "liff.state": "https://demi.example.org/app" }],
      ["trailing query on an allowlisted path", { "liff.state": "/app/personal?liff.hback=2" }],
      ["unapproved task", { "liff.state": "/app/patients/assigned?task=export" }],
    ])("rejects %s", (_label, query) => {
      expect(classifyLineWorkspaceLiffEntry(query)).toEqual({ status: "NAVIGATION_INVALID" });
    });

    it("resolves only exact allowlisted application destinations", () => {
      expect(resolveWorkspaceLiffDestination("")).toEqual({ valid: true, destination: null });
      expect(resolveWorkspaceLiffDestination("app/personal/care")).toEqual({ valid: true, destination: "/app/personal/care" });
      expect(resolveWorkspaceLiffDestination("/app/patients/assigned?task=screening"))
        .toEqual({ valid: true, destination: "/app/patients/assigned?task=screening" });
      expect(resolveWorkspaceLiffDestination("/app/personal/")).toEqual({ valid: false });
      expect(resolveWorkspaceLiffDestination("/app/personal/services")).toEqual({ valid: true, destination: "/app/personal/services" });
      expect(resolveWorkspaceLiffDestination("/app/personal/services?relationshipId=1")).toEqual({ valid: false });
    });

    it("does not change the input query object it classifies", () => {
      const query = Object.freeze({ "liff.state": "/app/personal", lineAppVersion: "14.19.1", "liff.hback": "2" });
      classifyLineWorkspaceLiffEntry(query);
      expect(query).toEqual({ "liff.state": "/app/personal", lineAppVersion: "14.19.1", "liff.hback": "2" });
    });
  });

  it("detects LIFF credential fragments of a bare LIFF launch without parsing other fragments", () => {
    expect(hasLiffCredentialFragment("#access_token=a&context_token=b&feature_token=c&id_token=d&client_id=1")).toBe(true);
    expect(hasLiffCredentialFragment("#context_token=only")).toBe(true);
    expect(hasLiffCredentialFragment("")).toBe(false);
    expect(hasLiffCredentialFragment("#")).toBe(false);
    expect(hasLiffCredentialFragment("#main")).toBe(false);
    expect(hasLiffCredentialFragment("#token=activation-capability")).toBe(false);
  });
});
