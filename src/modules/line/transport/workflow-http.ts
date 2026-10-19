import "server-only";

import { getLiveExactSession } from "@/modules/auth/services/exact-session-service";

import { LINE_WORKFLOW_APPOINTMENTS_PATH } from "../domain/line-workflow-routes";
import { LineWorkflowFailure, type LineWorkflowFailureCode } from "../domain/line-workflow-errors";
import { lineWorkflowVerifyRequestSchema } from "../schemas/line-schemas";
import { LINE_WORKFLOW_CONTEXT_COOKIE_NAME, lineWorkflowContextCookieOptions } from "../services/line-workflow-context";
import { getLineMiniAppConfiguration } from "../services/line-mini-app-configuration";
import {
  evaluateLineWorkflowEligibility,
  issueLineWorkflowContext,
  type LineWorkflowDependencies,
} from "../services/line-workflow-service";
import { readBoundedRequestText } from "./account-http";

const MAX_VERIFY_REQUEST_BYTES = 32 * 1024;

function topLevelMemberCount(text: string): number {
  let depth = 0;
  let members = 0;
  let inString = false;
  let escaped = false;
  let stringClosedAtTopLevel = false;
  for (const character of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") {
        inString = false;
        stringClosedAtTopLevel = depth === 1;
      }
      continue;
    }
    if (character === "\"") {
      inString = true;
      continue;
    }
    if (/\s/u.test(character)) continue;
    if (character === ":" && stringClosedAtTopLevel) members += 1;
    stringClosedAtTopLevel = false;
    if (character === "{" || character === "[") depth += 1;
    else if (character === "}" || character === "]") depth -= 1;
  }
  return members;
}

/** Codes a caller may observe; internal distinctions stay server-side. */
export type LineWorkflowResponseCode = Exclude<LineWorkflowFailureCode, "LINE_WRONG_AUDIENCE" | "BINDING_INCONSISTENT">;

export const LINE_WORKFLOW_SUCCESS_CODE = "SCOPE_GRANTED" as const;
export const LINE_WORKFLOW_SUCCESS_CONTINUATION = LINE_WORKFLOW_APPOINTMENTS_PATH;

const publicCode: Partial<Record<LineWorkflowFailureCode, LineWorkflowResponseCode>> = {
  // Audience confusion is reported like any other invalid proof.
  LINE_WRONG_AUDIENCE: "LINE_IDENTITY_INVALID",
  BINDING_INCONSISTENT: "WORKFLOW_INELIGIBLE",
};

const statusOf: Record<LineWorkflowResponseCode, number> = {
  WORKFLOW_DISABLED: 503,
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
  SCOPE_MISSING: 403,
  SCOPE_INVALID: 403,
  SCOPE_EXPIRED: 403,
  SCOPE_REVOKED: 403,
  SCOPE_SESSION_MISMATCH: 403,
  INFRASTRUCTURE_UNAVAILABLE: 503,
};

/** Superset of Supabase SSR cache headers plus the sensitive-page frame boundary. */
export const LINE_WORKFLOW_RESPONSE_HEADERS = {
  "cache-control": "private, no-cache, no-store, must-revalidate, max-age=0",
  expires: "0",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "content-security-policy": "frame-ancestors 'none'",
} as const;

/** Normalize header names before applying the stricter workflow policy. */
export function lineWorkflowResponseHeaders(authHeaders: HeadersInit = {}): Headers {
  const headers = new Headers(authHeaders);
  for (const [name, value] of Object.entries(LINE_WORKFLOW_RESPONSE_HEADERS)) headers.set(name, value);
  return headers;
}

function workflowResponse(
  code: LineWorkflowResponseCode,
  authHeaders: HeadersInit = {},
): Response {
  return Response.json({ code }, {
    status: statusOf[code],
    headers: lineWorkflowResponseHeaders(authHeaders),
  });
}

export function lineWorkflowErrorResponse(error: unknown, authHeaders: HeadersInit = {}): Response {
  if (error instanceof LineWorkflowFailure) {
    return workflowResponse(publicCode[error.code] ?? (error.code as LineWorkflowResponseCode), authHeaders);
  }
  // Raw exception text and provider payloads never reach the caller.
  return workflowResponse("INFRASTRUCTURE_UNAVAILABLE", authHeaders);
}

async function readWorkflowRequest(request: Request): Promise<{ intent: "OPEN_PATIENT_APPOINTMENTS"; idToken: string }> {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new LineWorkflowFailure("REQUEST_INVALID");
  let body: unknown;
  let text: string;
  try {
    // Same streamed cap and fatal UTF-8 decoding as the Account transport.
    text = await readBoundedRequestText(request, MAX_VERIFY_REQUEST_BYTES, () => new Error("invalid workflow body"));
    body = JSON.parse(text) as unknown;
  } catch {
    throw new LineWorkflowFailure("REQUEST_INVALID");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body) ||
      Object.keys(body).length !== topLevelMemberCount(text)) throw new LineWorkflowFailure("REQUEST_INVALID");
  const parsed = lineWorkflowVerifyRequestSchema.safeParse(body);
  if (!parsed.success) throw new LineWorkflowFailure("REQUEST_INVALID");
  return parsed.data;
}

function serializeWorkflowCookie(value: string, options: ReturnType<typeof lineWorkflowContextCookieOptions>): string {
  return `${LINE_WORKFLOW_CONTEXT_COOKIE_NAME}=${value}; Path=${options.path}; Max-Age=${options.maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * POST /api/line/workflow/verify. Issuance is governed by the single MINI
 * availability policy: a valid server-owned channel and an inactive kill switch.
 */
export async function handleLineWorkflowVerifyRequest(
  request: Request,
  dependencies: LineWorkflowDependencies = {},
): Promise<Response> {
  const authHeaders = new Headers();
  const liveSession = dependencies.liveSession ?? (() => getLiveExactSession({
    onResponseHeaders: (headers) => {
      for (const [name, value] of Object.entries(headers)) authHeaders.set(name, value);
    },
  }));

  try {
    const configuration = (dependencies.configuration ?? getLineMiniAppConfiguration)();
    if (request.headers.get("origin") !== configuration.origin) throw new LineWorkflowFailure("ORIGIN_DENIED");
    const input = await readWorkflowRequest(request);

    const scopedDependencies = { ...dependencies, liveSession, configuration: () => configuration };
    const eligibility = await evaluateLineWorkflowEligibility(input, scopedDependencies);
    const context = await issueLineWorkflowContext(eligibility, scopedDependencies);
    const now = dependencies.now?.() ?? new Date();
    const cookie = lineWorkflowContextCookieOptions(context.expiresAt, now);
    if (cookie.maxAge <= 0) throw new LineWorkflowFailure("LINE_IDENTITY_INVALID");

    const response = Response.json({
      code: LINE_WORKFLOW_SUCCESS_CODE,
      continuation: LINE_WORKFLOW_SUCCESS_CONTINUATION,
    }, {
      status: 200,
      headers: lineWorkflowResponseHeaders(authHeaders),
    });
    response.headers.append("set-cookie", serializeWorkflowCookie(context.value, cookie));
    return response;
  } catch (error: unknown) {
    return lineWorkflowErrorResponse(error, authHeaders);
  }
}
