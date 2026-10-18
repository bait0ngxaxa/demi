import "server-only";

import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import {
  appointmentAcknowledgementRequestSchema,
  appointmentCancellationRequestSchema,
} from "@/modules/appointments/schemas/appointment-schemas";
import { getLiveExactSession } from "@/modules/auth/services/exact-session-service";
import { ConflictError, ValidationError } from "@/shared/errors/application-error";

import { LineWorkflowFailure } from "../domain/line-workflow-errors";
import { LINE_WORKFLOW_CONTEXT_COOKIE_NAME } from "../services/line-workflow-context";
import { getLineMiniAppConfiguration, isLineMiniAppWorkflowEnabled } from "../services/line-mini-app-configuration";
import {
  runLineWorkflowScopedInteraction,
  type LineWorkflowScopedInteraction,
  type LineWorkflowScopedMutationDependencies,
} from "../services/line-workflow-service";
import { readBoundedRequestText } from "./account-http";
import { LINE_WORKFLOW_RESPONSE_HEADERS } from "./workflow-http";
import { lineWorkflowScopedFailureState, type LineWorkflowScopedFailureState } from "./workflow-scoped-appointments";

/** The fixed business fields are UUIDs, an ISO timestamp and a nonce; 2 KiB is ample. */
const MAX_INTERACTION_REQUEST_BYTES = 2 * 1024;

/** Finite, sanitized outcome: no identity, locator, version or raw error ever leaves the server. */
export type LineWorkflowInteractionErrorCode =
  | LineWorkflowScopedFailureState
  | "REQUEST_INVALID"
  | "ORIGIN_DENIED"
  | "CONFLICT";

export type LineWorkflowInteractionResponse =
  | { status: "SUCCESS"; operation: "ACKNOWLEDGED" | "CANCELLATION_REQUESTED" }
  | { status: "ERROR"; code: LineWorkflowInteractionErrorCode };

const httpStatus: Record<LineWorkflowInteractionErrorCode, number> = {
  NOT_ACTIVATED: 503,
  SCOPE_MISSING: 403,
  SCOPE_EXPIRED: 403,
  SCOPE_REVOKED: 403,
  SESSION_MISMATCH: 403,
  LOGIN_REQUIRED: 401,
  AUTH_UNAVAILABLE: 503,
  INELIGIBLE: 403,
  RESOURCE_INVALID: 404,
  TEMPORARILY_UNAVAILABLE: 503,
  REQUEST_INVALID: 400,
  ORIGIN_DENIED: 403,
  CONFLICT: 409,
};

const interactions = {
  ACKNOWLEDGE: { schema: appointmentAcknowledgementRequestSchema, operation: "ACKNOWLEDGED" },
  CANCELLATION_REQUEST: { schema: appointmentCancellationRequestSchema, operation: "CANCELLATION_REQUESTED" },
} as const;

class InteractionRequestRejected extends Error {
  constructor(readonly code: "REQUEST_INVALID" | "ORIGIN_DENIED") {
    super("LINE workflow interaction request rejected");
  }
}

function errorCodeOf(error: unknown): LineWorkflowInteractionErrorCode {
  if (error instanceof InteractionRequestRejected) return error.code;
  // Existing domain conflict semantics (stale version, non-SCHEDULED, used nonce, exhausted retries).
  if (error instanceof ConflictError) return "CONFLICT";
  if (error instanceof ValidationError) return "REQUEST_INVALID";
  return lineWorkflowScopedFailureState(error);
}

/**
 * Number of members in the top-level JSON object. JSON.parse silently keeps
 * the last of duplicate keys (including escaped spellings of the same key), so
 * a mismatch with the parsed key count means an ambiguous body.
 */
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

async function readInteractionBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new InteractionRequestRejected("REQUEST_INVALID");
  const reject = (): Error => new InteractionRequestRejected("REQUEST_INVALID");
  const text = await readBoundedRequestText(request, MAX_INTERACTION_REQUEST_BYTES, reject);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw reject();
  }
  if (typeof body !== "object" || body === null || Array.isArray(body) ||
      Object.keys(body).length !== topLevelMemberCount(text)) {
    throw reject();
  }
  return body;
}

function interactionResponse(body: LineWorkflowInteractionResponse, status: number, authHeaders: Record<string, string>): Response {
  // SSR auth cache headers first, then this transport's stricter superset; never CORS.
  return Response.json(body, { status, headers: { ...authHeaders, ...LINE_WORKFLOW_RESPONSE_HEADERS } });
}

export type LineWorkflowInteractionHandlerDependencies = LineWorkflowScopedMutationDependencies & {
  enabled?: () => boolean;
  credential?: () => Promise<string | undefined>;
};

async function readWorkflowCredential(): Promise<string | undefined> {
  return (await cookies()).get(LINE_WORKFLOW_CONTEXT_COOKIE_NAME)?.value;
}

/**
 * Fixed scoped interaction transport (17J.3B sections 12.4 and 17). Order:
 * default-disabled gate, trusted tuple, exact canonical Origin, no Server
 * Action dispatch, JSON content type, bounded strict body (existing domain
 * schema, no extra or duplicate fields), then the mandatory HttpOnly workflow
 * cookie and the scoped runner. It never issues, renews or clears the
 * workflow context; Supabase cookie writes from the exact-session check are
 * applied by Next.js and their cache headers are merged here.
 */
export async function handleLineWorkflowInteractionRequest(
  request: Request,
  interaction: LineWorkflowScopedInteraction,
  dependencies: LineWorkflowInteractionHandlerDependencies = {},
): Promise<Response> {
  const authHeaders: Record<string, string> = {};
  const collectAuthHeaders = (headers: Record<string, string>): void => {
    Object.assign(authHeaders, headers);
  };
  try {
    if (!(dependencies.enabled ?? isLineMiniAppWorkflowEnabled)()) throw new LineWorkflowFailure("WORKFLOW_DISABLED");
    const configuration = (dependencies.configuration ?? getLineMiniAppConfiguration)();
    if (request.headers.get("origin") !== configuration.origin) throw new InteractionRequestRejected("ORIGIN_DENIED");
    if (request.headers.has("next-action")) throw new InteractionRequestRejected("REQUEST_INVALID");
    const parsed = interactions[interaction].schema.safeParse(await readInteractionBody(request));
    if (!parsed.success) throw new InteractionRequestRejected("REQUEST_INVALID");
    const credential = await (dependencies.credential ?? readWorkflowCredential)();
    await runLineWorkflowScopedInteraction(credential, interaction, parsed.data, {
      liveSession: () => getLiveExactSession({ onResponseHeaders: collectAuthHeaders }),
      ...dependencies,
      configuration: () => configuration,
    });
    return interactionResponse({ status: "SUCCESS", operation: interactions[interaction].operation }, 200, authHeaders);
  } catch (error: unknown) {
    unstable_rethrow(error);
    const code = errorCodeOf(error);
    return interactionResponse({ status: "ERROR", code }, httpStatus[code], authHeaders);
  }
}
