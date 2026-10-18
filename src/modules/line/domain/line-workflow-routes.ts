import { LINE_WORKFLOW_GATEWAY_PATH } from "./line-navigation-intents";

/** Scoped Appointment MINI destinations; every link is built here, never from a request URL. */
export const LINE_WORKFLOW_APPOINTMENTS_PATH = `${LINE_WORKFLOW_GATEWAY_PATH}/appointments` as const;

/**
 * Reserved for the B2.2 fixed POST Route Handlers. Not implemented in B2.1:
 * the proxy answers them itself, so they can never reach the
 * `[relationshipId]` rendering page.
 */
export const LINE_WORKFLOW_APPOINTMENT_HANDLER_PATHS = [
  `${LINE_WORKFLOW_APPOINTMENTS_PATH}/acknowledge`,
  `${LINE_WORKFLOW_APPOINTMENTS_PATH}/cancellation-request`,
] as const;

const VERIFY_HANDLER_PATH = "/api/line/workflow/verify";
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const RENDERING_PATH = new RegExp(`^${LINE_WORKFLOW_APPOINTMENTS_PATH}(?:/${UUID}(?:/${UUID})?)?$`, "u");

export const lineWorkflowAppointmentLinks = {
  root: LINE_WORKFLOW_APPOINTMENTS_PATH,
  history: (relationshipId: string): string =>
    `${LINE_WORKFLOW_APPOINTMENTS_PATH}/${encodeURIComponent(relationshipId)}`,
  detail: (relationshipId: string, appointmentId: string): string =>
    `${LINE_WORKFLOW_APPOINTMENTS_PATH}/${encodeURIComponent(relationshipId)}/${encodeURIComponent(appointmentId)}`,
} as const;

export type LineWorkflowRouteDecision = "PASS" | "METHOD_NOT_ALLOWED" | "REJECTED" | "NOT_FOUND";

function isWorkflowNamespace(pathname: string): boolean {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Malformed escapes are judged on the raw form below.
  }
  const normalized = decoded.replace(/\\/gu, "/").replace(/\/{2,}/gu, "/").toLowerCase();
  return normalized.startsWith(LINE_WORKFLOW_GATEWAY_PATH) || normalized.startsWith("/api/line/workflow");
}

/**
 * Finite receiving-route filter for the MINI namespace (defense in depth; each
 * scoped read still enforces its own authorization). Rendering pages accept
 * only GET/HEAD without a Server Action header, so neither crafted Next-Action
 * requests nor form-action POSTs reach framework action dispatch. Anything
 * encoded, ambiguous or unknown in the namespace is not routed at all.
 * Returns null outside the namespace.
 */
export function classifyLineWorkflowRequest(input: {
  method: string;
  pathname: string;
  serverAction: boolean;
}): LineWorkflowRouteDecision | null {
  if (!isWorkflowNamespace(input.pathname)) return null;
  if (input.pathname === VERIFY_HANDLER_PATH) return "PASS";
  // B2.2 will admit POST only, to dedicated handlers; until then nothing is routed.
  if (LINE_WORKFLOW_APPOINTMENT_HANDLER_PATHS.some((path) => path === input.pathname)) return "NOT_FOUND";
  if (input.pathname === LINE_WORKFLOW_GATEWAY_PATH || RENDERING_PATH.test(input.pathname)) {
    if (input.method !== "GET" && input.method !== "HEAD") return "METHOD_NOT_ALLOWED";
    return input.serverAction ? "REJECTED" : "PASS";
  }
  return "NOT_FOUND";
}
