import { describe, expect, it } from "vitest";

import { isLineQuickActionLoginReturnTo, loginReturnToSchema } from "@/modules/auth/schemas/login-schema";

import {
  classifyLineWorkflowEntry,
  getLineQuickActionReturnPathFromUrl,
  LINE_WEB_NAVIGATION_PATHS,
  LINE_WORKFLOW_GATEWAY_PATH,
} from "./line-navigation-intents";
import { classifyLineWorkspaceLiffEntry, LINE_WORKSPACE_LIFF_DESTINATIONS } from "./line-workspace-liff-entry";

const ORIGIN = "https://demi.example.org";

/**
 * Regression matrix across module boundaries. These are mocked/unit checks of
 * DEMI's contract; they do not prove LINE WebView or LINE Console behavior.
 */
describe("Workspace LIFF integration regression matrix", () => {
  const operationalDestinations = LINE_WORKSPACE_LIFF_DESTINATIONS.filter((path) => path !== LINE_WEB_NAVIGATION_PATHS.OPEN_WORK_WORKSPACE);

  it.each(operationalDestinations)(
    "secondary redirect to %s keeps the existing exact login return for unauthenticated users",
    (destination) => {
      // LIFF's secondary redirect for a root Endpoint URL is origin + liff.state, unchanged.
      expect(getLineQuickActionReturnPathFromUrl(new URL(destination, ORIGIN))).toBe(destination);
      expect(isLineQuickActionLoginReturnTo(destination)).toBe(true);
      expect(loginReturnToSchema.safeParse(destination).success).toBe(true);
    },
  );

  it("sends the work dashboard entry to the default post-login destination instead of a new return path", () => {
    expect(isLineQuickActionLoginReturnTo("/app")).toBe(false);
    expect(classifyLineWorkspaceLiffEntry({ "liff.state": "/app" })).toEqual({ status: "LIFF", destination: "/app" });
  });

  it("never turns a Workspace LIFF destination into an Account or MINI destination", () => {
    for (const destination of LINE_WORKSPACE_LIFF_DESTINATIONS) {
      expect(destination.startsWith("/app")).toBe(true);
      expect(destination.startsWith("/line/")).toBe(false);
      expect(destination).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|U[0-9a-f]{32}|token|code=/iu);
    }
    expect(classifyLineWorkspaceLiffEntry({ "liff.state": "/line/account" })).toEqual({ status: "NAVIGATION_INVALID" });
    expect(classifyLineWorkspaceLiffEntry({ "liff.state": LINE_WORKFLOW_GATEWAY_PATH })).toEqual({ status: "NAVIGATION_INVALID" });
  });

  it("keeps the MINI gateway's own single-intent liff.state contract untouched", () => {
    expect(classifyLineWorkflowEntry({ "liff.state": "?intent=OPEN_PATIENT_APPOINTMENTS" })).toEqual({ status: "VALID", intent: "OPEN_PATIENT_APPOINTMENTS" });
    expect(classifyLineWorkflowEntry({ "liff.state": "/app/personal" })).toEqual({ status: "PLATFORM_STATE_INVALID" });
  });

  it("lets a cancelled LINE Login return reach LIFF init so it becomes a retryable failure", () => {
    expect(classifyLineWorkspaceLiffEntry({
      "liff.state": "/app/personal",
      error: "access_denied",
      error_description: "The user has not granted the requested permissions.",
      liffOAuth2Error: "true",
      liffClientId: "1234567890",
    })).toEqual({ status: "LIFF", destination: "/app/personal" });
    // MINI's stricter set is unchanged.
    expect(classifyLineWorkflowEntry({ liffOAuth2Error: "true" })).toEqual({ status: "NAVIGATION_INVALID" });
  });

  it("does not accept stale or unknown navigation intents as destinations", () => {
    for (const stale of ["/app/patients/assigned?task=followup", "/app/personal/exercises", "/app/personal/", "/APP/PERSONAL"]) {
      expect(classifyLineWorkspaceLiffEntry({ "liff.state": stale })).toEqual({ status: "NAVIGATION_INVALID" });
    }
  });
});
