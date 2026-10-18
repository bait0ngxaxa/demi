/*
 * Browser-side gateway steps for the MINI App initialization shell. These
 * steps produce UI state only; every authority decision is made on the server.
 */

import { LINE_WORKFLOW_INTENT } from "@/modules/line/domain/line-navigation-intents";

export type LineWorkflowGatewayState =
  | "INITIALIZING"
  | "INIT_FAILED"
  | "LINE_LOGIN_REQUIRED"
  | "VERIFYING"
  | "LINE_PROOF_UNAVAILABLE"
  | "LOGIN_REQUIRED"
  | "ACCOUNT_MISMATCH"
  | "LINE_NOT_LINKED"
  | "WORKFLOW_INELIGIBLE"
  | "NOT_ACTIVATED"
  | "RATE_LIMITED"
  | "TEMPORARILY_UNAVAILABLE";

export type LineWorkflowLiff = {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  getIDToken(): string | null;
};

export const LINE_WORKFLOW_INIT_TIMEOUT_MS = 10_000;
const VERIFY_TIMEOUT_MS = 25_000;

/**
 * LIFF must initialize before any URL change: primary/secondary redirects and
 * LINE login returns carry SDK parameters that only init may consume.
 */
export async function initializeLineWorkflowLiff(
  liff: LineWorkflowLiff,
  liffId: string,
  timeoutMs = LINE_WORKFLOW_INIT_TIMEOUT_MS,
): Promise<"READY" | "LINE_LOGIN_REQUIRED" | "INIT_FAILED"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([liff.init({ liffId }), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("LIFF initialization timed out")), timeoutMs);
    })]);
    return liff.isLoggedIn() ? "READY" : "LINE_LOGIN_REQUIRED";
  } catch {
    return "INIT_FAILED";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const stateByCode: Record<string, LineWorkflowGatewayState> = {
  LOGIN_REQUIRED: "LOGIN_REQUIRED",
  ACCOUNT_MISMATCH: "ACCOUNT_MISMATCH",
  LINE_NOT_LINKED: "LINE_NOT_LINKED",
  WORKFLOW_INELIGIBLE: "WORKFLOW_INELIGIBLE",
  LINE_IDENTITY_INVALID: "LINE_PROOF_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  WORKFLOW_DISABLED: "NOT_ACTIVATED",
  WORKFLOW_NOT_ACTIVATED: "NOT_ACTIVATED",
};

/** Unknown or unexpected responses, including any 2xx in B1, never continue the workflow. */
export function lineWorkflowStateFromResponse(body: unknown): LineWorkflowGatewayState {
  const code = body && typeof body === "object" && !Array.isArray(body) && "code" in body ? body.code : undefined;
  return (typeof code === "string" && Object.hasOwn(stateByCode, code) ? stateByCode[code] : undefined) ??
    "TEMPORARILY_UNAVAILABLE";
}

/** One explicit attempt: transient proof only in the same-origin POST body. */
export async function verifyLineWorkflow(
  liff: LineWorkflowLiff,
  fetcher: typeof fetch = fetch,
): Promise<LineWorkflowGatewayState> {
  let idToken: string | null;
  try {
    idToken = liff.getIDToken();
  } catch {
    idToken = null;
  }
  if (!idToken) return "LINE_PROOF_UNAVAILABLE";
  try {
    const response = await fetcher("/api/line/workflow/verify", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: LINE_WORKFLOW_INTENT, idToken }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return lineWorkflowStateFromResponse(body);
  } catch {
    return "TEMPORARILY_UNAVAILABLE";
  }
}

const LOGIN_ATTEMPT_KEY = "demi.line.workflow.loginAttempted";

/** Non-authoritative latch: deleting it can only cause another prompt, never access. */
export function markLineWorkflowLoginAttempt(storage: Pick<Storage, "setItem">): void {
  try {
    storage.setItem(LOGIN_ATTEMPT_KEY, "1");
  } catch {
    // Storage may be unavailable; the explicit login link still works.
  }
}

export function consumeLineWorkflowLoginAttempt(storage: Pick<Storage, "getItem" | "removeItem">): boolean {
  try {
    const attempted = storage.getItem(LOGIN_ATTEMPT_KEY) === "1";
    storage.removeItem(LOGIN_ATTEMPT_KEY);
    return attempted;
  } catch {
    return false;
  }
}
