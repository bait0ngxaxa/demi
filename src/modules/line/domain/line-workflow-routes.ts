import { LINE_WORKFLOW_GATEWAY_PATH } from "./line-navigation-intents";

/** Scoped Appointment MINI destinations; every link is built here, never from a request URL. */
export const LINE_WORKFLOW_APPOINTMENTS_PATH = `${LINE_WORKFLOW_GATEWAY_PATH}/appointments` as const;

/**
 * The two fixed POST-only scoped interaction Route Handlers. Static segments
 * take precedence over `[relationshipId]`, and the proxy admits only POST
 * here, so neither path can reach the rendering page.
 */
export const lineWorkflowAppointmentHandlers = {
  acknowledge: `${LINE_WORKFLOW_APPOINTMENTS_PATH}/acknowledge`,
  cancellationRequest: `${LINE_WORKFLOW_APPOINTMENTS_PATH}/cancellation-request`,
} as const;

export const LINE_WORKFLOW_APPOINTMENT_HANDLER_PATHS = [
  lineWorkflowAppointmentHandlers.acknowledge,
  lineWorkflowAppointmentHandlers.cancellationRequest,
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

export type LineWorkflowRouteDecision = "PASS" | "METHOD_NOT_ALLOWED" | "HANDLER_METHOD_NOT_ALLOWED" | "REJECTED" | "NOT_FOUND";

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
 * scoped read and interaction still enforces its own authorization). Rendering
 * pages accept only GET/HEAD and the two interaction handlers only POST, each
 * without a Server Action header, so neither crafted Next-Action requests nor
 * form-action POSTs reach framework action dispatch. Anything encoded,
 * ambiguous or unknown in the namespace is not routed at all.
 * Returns null outside the namespace.
 */
export function classifyLineWorkflowRequest(input: {
  method: string;
  pathname: string;
  serverAction: boolean;
}): LineWorkflowRouteDecision | null {
  if (!isWorkflowNamespace(input.pathname)) return null;
  if (input.pathname === VERIFY_HANDLER_PATH) return "PASS";
  if (LINE_WORKFLOW_APPOINTMENT_HANDLER_PATHS.some((path) => path === input.pathname)) {
    if (input.method !== "POST") return "HANDLER_METHOD_NOT_ALLOWED";
    return input.serverAction ? "REJECTED" : "PASS";
  }
  if (input.pathname === LINE_WORKFLOW_GATEWAY_PATH || RENDERING_PATH.test(input.pathname)) {
    if (input.method !== "GET" && input.method !== "HEAD") return "METHOD_NOT_ALLOWED";
    return input.serverAction ? "REJECTED" : "PASS";
  }
  return "NOT_FOUND";
}
