import { describe, expect, it } from "vitest";

import { LINE_WEB_NAVIGATION_PATHS } from "./line-navigation-intents";
import {
  classifyLineWorkspaceLiffEntry,
  hasLiffCredentialFragment,
  LINE_WORKSPACE_LIFF_DESTINATIONS,
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

  it("detects LIFF credential fragments of a bare LIFF launch without parsing other fragments", () => {
    expect(hasLiffCredentialFragment("#access_token=a&context_token=b&feature_token=c&id_token=d&client_id=1")).toBe(true);
    expect(hasLiffCredentialFragment("#context_token=only")).toBe(true);
    expect(hasLiffCredentialFragment("")).toBe(false);
    expect(hasLiffCredentialFragment("#")).toBe(false);
    expect(hasLiffCredentialFragment("#main")).toBe(false);
    expect(hasLiffCredentialFragment("#token=activation-capability")).toBe(false);
  });
});
