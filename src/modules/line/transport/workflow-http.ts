import "server-only";

import { LineWorkflowFailure, type LineWorkflowFailureCode } from "../domain/line-workflow-errors";
import { lineWorkflowVerifyRequestSchema } from "../schemas/line-schemas";
import { getLineMiniAppConfiguration, isLineMiniAppWorkflowEnabled } from "../services/line-mini-app-configuration";
import { evaluateLineWorkflowEligibility, type LineWorkflowDependencies } from "../services/line-workflow-service";
import { readAccountJson } from "./account-http";

/** Codes a caller may observe; internal distinctions stay server-side. */
export type LineWorkflowResponseCode = Exclude<LineWorkflowFailureCode, "LINE_WRONG_AUDIENCE" | "BINDING_INCONSISTENT">;

const publicCode: Partial<Record<LineWorkflowFailureCode, LineWorkflowResponseCode>> = {
  // Audience confusion is reported like any other invalid proof.
  LINE_WRONG_AUDIENCE: "LINE_IDENTITY_INVALID",
  BINDING_INCONSISTENT: "WORKFLOW_INELIGIBLE",
};

const statusOf: Record<LineWorkflowResponseCode, number> = {
  WORKFLOW_DISABLED: 503,
  WORKFLOW_NOT_ACTIVATED: 503,
  MINI_CONFIGURATION_UNAVAILABLE: 503,
  LIFECYCLE_UNAVAILABLE: 503,
  ORIGIN_DENIED: 403,
  REQUEST_INVALID: 400,
  RATE_LIMITED: 429,
  LOGIN_REQUIRED: 401,
  SESSION_UNAVAILABLE: 503,
  LINE_IDENTITY_INVALID: 400,
  LINE_PROVIDER_UNAVAILABLE: 503,
  LINE_PROVIDER_RESPONSE_INVALID: 503,
  LINE_NOT_LINKED: 403,
  ACCOUNT_MISMATCH: 403,
  WORKFLOW_INELIGIBLE: 403,
  SCOPE_INVALID: 403,
  SCOPE_EXPIRED: 403,
  SCOPE_REVOKED: 403,
  SCOPE_SESSION_MISMATCH: 403,
  INFRASTRUCTURE_UNAVAILABLE: 503,
};

/** Superset of the Supabase SSR auth cache headers plus no-referrer for this sensitive transport. */
export const LINE_WORKFLOW_RESPONSE_HEADERS = {
  "cache-control": "private, no-cache, no-store, must-revalidate, max-age=0",
  expires: "0",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

function workflowResponse(code: LineWorkflowResponseCode): Response {
  return Response.json({ code }, { status: statusOf[code], headers: LINE_WORKFLOW_RESPONSE_HEADERS });
}

export function lineWorkflowErrorResponse(error: unknown): Response {
  if (error instanceof LineWorkflowFailure) {
    return workflowResponse(publicCode[error.code] ?? (error.code as LineWorkflowResponseCode));
  }
  // Raw exception text and provider payloads never reach the caller.
  return workflowResponse("INFRASTRUCTURE_UNAVAILABLE");
}

async function readWorkflowRequest(request: Request): Promise<{ intent: "OPEN_PATIENT_APPOINTMENTS"; idToken: string }> {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new LineWorkflowFailure("REQUEST_INVALID");
  let body: unknown;
  try {
    // Same streamed 32 KiB cap and fatal UTF-8 decoding as the Account transport.
    body = await readAccountJson(request);
  } catch {
    throw new LineWorkflowFailure("REQUEST_INVALID");
  }
  const parsed = lineWorkflowVerifyRequestSchema.safeParse(body);
  if (!parsed.success) throw new LineWorkflowFailure("REQUEST_INVALID");
  return parsed.data;
}

/**
 * POST /api/line/workflow/verify. Phase B1 activation fence: the default
 * disabled gate stops before any provider work, and even an enabled gate ends
 * every fully eligible request with WORKFLOW_NOT_ACTIVATED. No context cookie,
 * scope or success continuation is ever returned in B1.
 */
export async function handleLineWorkflowVerifyRequest(
  request: Request,
  dependencies: LineWorkflowDependencies & { enabled?: () => boolean } = {},
): Promise<Response> {
  try {
    if (!(dependencies.enabled ?? isLineMiniAppWorkflowEnabled)()) throw new LineWorkflowFailure("WORKFLOW_DISABLED");
    const configuration = (dependencies.configuration ?? getLineMiniAppConfiguration)();
    if (request.headers.get("origin") !== configuration.origin) throw new LineWorkflowFailure("ORIGIN_DENIED");
    const input = await readWorkflowRequest(request);
    await evaluateLineWorkflowEligibility(input, { ...dependencies, configuration: () => configuration });
    throw new LineWorkflowFailure("WORKFLOW_NOT_ACTIVATED");
  } catch (error: unknown) {
    return lineWorkflowErrorResponse(error);
  }
}
