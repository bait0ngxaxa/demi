export const LINE_WEB_NAVIGATION_PATHS = {
  OPEN_PATIENT_WORKSPACE: "/app/personal",
  OPEN_WORK_WORKSPACE: "/app",
  OPEN_OSM_ASSIGNED_PATIENTS: "/app/patients/assigned",
  START_OSM_SCREENING: "/app/patients/assigned?task=screening",
  // CT-3: the OSM follow-up queue is the จัดบริการ workspace.
  START_OSM_FOLLOWUP: "/app/services",
  OPEN_PATIENT_PROVISIONING: "/app/patients/provision",
  OPEN_PATIENT_APPOINTMENTS: "/app/personal/appointments",
  OPEN_PATIENT_WELLNESS: "/app/personal/wellness",
  OPEN_PATIENT_MEDICATIONS: "/app/personal/medications",
  OPEN_PATIENT_CARE: "/app/personal/care",
} as const;

export type LineWebNavigationIntent = keyof typeof LINE_WEB_NAVIGATION_PATHS;

/**
 * The START_OSM_FOLLOWUP URL before CT-3. Messages and rich menus already sent still open it, so it keeps its
 * login return and the assigned list redirects it to /app/services.
 */
export const LEGACY_OSM_FOLLOWUP_PATH = "/app/patients/assigned?task=followup";

export const LINE_QUICK_ACTION_RETURN_PATHS = [
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_WORKSPACE,
  LINE_WEB_NAVIGATION_PATHS.OPEN_OSM_ASSIGNED_PATIENTS,
  LINE_WEB_NAVIGATION_PATHS.START_OSM_SCREENING,
  LINE_WEB_NAVIGATION_PATHS.START_OSM_FOLLOWUP,
  LEGACY_OSM_FOLLOWUP_PATH,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_PROVISIONING,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_APPOINTMENTS,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_WELLNESS,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_MEDICATIONS,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_CARE,
] as const;

export type LineQuickActionReturnPath = (typeof LINE_QUICK_ACTION_RETURN_PATHS)[number];

export const LINE_QUICK_ACTION_RETURN_TO_HEADER = "x-demi-line-quick-action-return-to";

/** Bounds for an entry URL's query before any parsing; LINE-generated URLs are far smaller. */
const MAX_ENTRY_QUERY_LENGTH = 4096;
const MAX_ENTRY_QUERY_SEGMENTS = 32;

function decodeQueryName(segment: string): string | null {
  const separator = segment.indexOf("=");
  const rawName = separator === -1 ? segment : segment.slice(0, separator);
  try {
    return decodeURIComponent(rawName.replaceAll("+", " "));
  } catch {
    return null;
  }
}

/**
 * The application part of a LINE entry URL: pathname plus the application
 * query segments exactly as received (raw, in order), with LINE platform
 * bookkeeping removed. Platform segments are `liff.*` / `lineAppVersion`
 * (added by LIFF redirects, e.g. `liff.hback` after an in-LINE login) and,
 * only on a LINE Login return marked by `liffClientId`, the OAuth return
 * markers. Application segments are never decoded, reordered or
 * deduplicated, so repeated, re-encoded or extra application parameters
 * cannot collapse into an allowlisted destination. Null for oversized or
 * malformed queries.
 */
export function canonicalizeLineEntryPath(url: URL): string | null {
  const query = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  if (query === "") return url.pathname;
  if (query.length > MAX_ENTRY_QUERY_LENGTH) return null;
  const segments = query.split("&");
  if (segments.length > MAX_ENTRY_QUERY_SEGMENTS) return null;

  const named: { segment: string; name: string }[] = [];
  for (const segment of segments) {
    const name = segment === "" ? null : decodeQueryName(segment);
    if (name === null || name === "") return null;
    named.push({ segment, name });
  }
  const lineLoginReturn = named.some(({ name }) => name === LIFF_LOGIN_RETURN_MARKER);
  const application = named
    .filter(({ name }) => !isLinePlatformParameterName(name) && !(lineLoginReturn && LIFF_LOGIN_RETURN_PARAMETERS.has(name)))
    .map(({ segment }) => segment);
  return application.length === 0 ? url.pathname : `${url.pathname}?${application.join("&")}`;
}

/**
 * Exact allowlisted quick-action destination of a request, after removing
 * only LINE platform bookkeeping. Proxy computes it once; the layout and login
 * page only ever see the resulting allowlisted constant, never the raw URL.
 */
export function getLineQuickActionReturnPathFromUrl(url: URL): LineQuickActionReturnPath | null {
  const requestedPath = canonicalizeLineEntryPath(url);
  if (requestedPath === null) return null;
  return LINE_QUICK_ACTION_RETURN_PATHS.find((path) => path === requestedPath) ?? null;
}

/** The only MINI App workflow intent. It is navigation input, never authority. */
export const LINE_WORKFLOW_INTENT = "OPEN_PATIENT_APPOINTMENTS" as const;
export type LineWorkflowIntent = typeof LINE_WORKFLOW_INTENT;
export const LINE_WORKFLOW_GATEWAY_PATH = "/line/workflow";
/** Exact normalized gateway return accepted by the shared login classifier. */
export const LINE_WORKFLOW_LOGIN_RETURN_PATH = `${LINE_WORKFLOW_GATEWAY_PATH}?intent=${LINE_WORKFLOW_INTENT}` as const;

/** Parameters the LIFF SDK may add on primary/secondary redirects or LINE login return. */
export const LIFF_PLATFORM_PARAMETERS: ReadonlySet<string> = new Set([
  "liff.state", "liff.referrer", "liff.hback", "liffClientId", "liffRedirectUri", "liffIsEscapedFromApp",
  "code", "state", "error", "error_description",
]);
export const MAX_PLATFORM_PARAMETER_LENGTH = 2048;

/**
 * Query parameters owned by the LINE platform rather than by DEMI. LINE
 * reserves the `liff.` prefix for SDK initialization and LIFF-to-LIFF
 * transitions (`liff.state`, `liff.referrer`, `liff.hback`, and future ones)
 * and adds `lineAppVersion` on Android. They are bookkeeping, never navigation
 * authority, and must reach `liff.init()` untouched. Names are bounded so an
 * unbounded attacker-chosen name cannot pass as a platform parameter.
 */
const LINE_PLATFORM_PARAMETER_NAME = /^(?:liff\.[A-Za-z][A-Za-z0-9_]{0,31}|lineAppVersion)$/u;

export function isLinePlatformParameterName(name: string): boolean {
  return LINE_PLATFORM_PARAMETER_NAME.test(name);
}

/**
 * Markers LIFF adds when LINE Login returns to the redirect URI it built from
 * the current URL. `liffClientId` identifies the return; the generic OAuth
 * names are LINE-owned only together with it.
 */
export const LIFF_LOGIN_RETURN_MARKER = "liffClientId";
export const LIFF_LOGIN_RETURN_PARAMETERS: ReadonlySet<string> = new Set([
  LIFF_LOGIN_RETURN_MARKER, "liffRedirectUri", "liffIsEscapedFromApp", "liffOAuth2Error",
  "code", "state", "error", "error_description",
]);

/** Upper bound on query parameters a LINE-generated entry URL is expected to carry. */
export const MAX_PLATFORM_PARAMETER_COUNT = 24;

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
