export const LINE_WEB_NAVIGATION_PATHS = {
  OPEN_PATIENT_WORKSPACE: "/app/personal",
  OPEN_WORK_WORKSPACE: "/app",
  OPEN_OSM_ASSIGNED_PATIENTS: "/app/patients/assigned",
  START_OSM_SCREENING: "/app/patients/assigned?task=screening",
  START_OSM_FOLLOWUP: "/app/patients/assigned?task=followup",
  OPEN_PATIENT_PROVISIONING: "/app/patients/provision",
  OPEN_PATIENT_APPOINTMENTS: "/app/personal/appointments",
  OPEN_PATIENT_WELLNESS: "/app/personal/wellness",
  OPEN_PATIENT_MEDICATIONS: "/app/personal/medications",
  OPEN_PATIENT_CARE: "/app/personal/care",
} as const;

export type LineWebNavigationIntent = keyof typeof LINE_WEB_NAVIGATION_PATHS;

export const LINE_QUICK_ACTION_RETURN_PATHS = [
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_WORKSPACE,
  LINE_WEB_NAVIGATION_PATHS.OPEN_OSM_ASSIGNED_PATIENTS,
  LINE_WEB_NAVIGATION_PATHS.START_OSM_SCREENING,
  LINE_WEB_NAVIGATION_PATHS.START_OSM_FOLLOWUP,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_PROVISIONING,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_APPOINTMENTS,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_WELLNESS,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_MEDICATIONS,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_CARE,
] as const;

export type LineQuickActionReturnPath = (typeof LINE_QUICK_ACTION_RETURN_PATHS)[number];

export const LINE_QUICK_ACTION_RETURN_TO_HEADER = "x-demi-line-quick-action-return-to";

export function getLineQuickActionReturnPathFromUrl(url: URL): LineQuickActionReturnPath | null {
  const requestedPath = `${url.pathname}${url.search}`;
  return LINE_QUICK_ACTION_RETURN_PATHS.find((path) => path === requestedPath) ?? null;
}

/** The only MINI App workflow intent. It is navigation input, never authority. */
export const LINE_WORKFLOW_INTENT = "OPEN_PATIENT_APPOINTMENTS" as const;
export type LineWorkflowIntent = typeof LINE_WORKFLOW_INTENT;
export const LINE_WORKFLOW_GATEWAY_PATH = "/line/workflow";
/** Exact normalized gateway return accepted by the shared login classifier. */
export const LINE_WORKFLOW_LOGIN_RETURN_PATH = `${LINE_WORKFLOW_GATEWAY_PATH}?intent=${LINE_WORKFLOW_INTENT}` as const;

/** Parameters the LIFF SDK may add on primary/secondary redirects or LINE login return. */
const LIFF_PLATFORM_PARAMETERS = new Set([
  "liff.state", "liff.referrer", "liff.hback", "liffClientId", "liffRedirectUri", "liffIsEscapedFromApp",
  "code", "state", "error", "error_description",
]);
const MAX_PLATFORM_PARAMETER_LENGTH = 2048;

export type LineWorkflowEntry =
  | { status: "VALID"; intent: LineWorkflowIntent }
  | { status: "NAVIGATION_INVALID" }
  | { status: "PLATFORM_STATE_INVALID" };

/**
 * Bare MINI launch and the exact login return both map to the single intent.
 * liff.state is untrusted: only an absent value or the exact canonical intent
 * suffix may be handed to SDK initialization; nothing is followed server-side.
 */
export function classifyLineWorkflowEntry(
  query: Readonly<Record<string, string | string[] | undefined>>,
): LineWorkflowEntry {
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) return { status: "NAVIGATION_INVALID" };
    if (name === "intent") {
      if (value !== LINE_WORKFLOW_INTENT) return { status: "NAVIGATION_INVALID" };
      continue;
    }
    if (!LIFF_PLATFORM_PARAMETERS.has(name) || value.length > MAX_PLATFORM_PARAMETER_LENGTH) {
      return { status: "NAVIGATION_INVALID" };
    }
    if (name === "liff.state" && value !== "" && value !== `?intent=${LINE_WORKFLOW_INTENT}`) {
      return { status: "PLATFORM_STATE_INVALID" };
    }
  }
  return { status: "VALID", intent: LINE_WORKFLOW_INTENT };
}
