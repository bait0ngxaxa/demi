/**
 * Browser-context facts used only for presentation and navigation choices.
 * None of them is authentication or authorization evidence: a user agent and
 * session storage are client-controlled, and every destination keeps its own
 * DEMI session and server authorization checks.
 */

/** The ordinary web route of the LINE account screen (also the Account LIFF Endpoint URL path). */
export const LINE_ACCOUNT_PATH = "/line/account";

/**
 * Mirrors `@line/liff` 2.31.1 `isLIFFBrowser()` (`@liff/util`), which
 * `liff.isInClient()` uses before initialization. LINE's ordinary in-app
 * browser and external browsers do not match.
 */
const LIFF_BROWSER_USER_AGENT = /Line\/\d+\.\d+\.\d+ LIFF/u;

export function isLiffBrowserUserAgent(userAgent: string): boolean {
  return LIFF_BROWSER_USER_AGENT.test(userAgent);
}

/** Exactly the shape `buildAccountLiffUrl()` produces; anything else is never followed as a LIFF transition. */
const ACCOUNT_LIFF_URL = /^https:\/\/liff\.line\.me\/\d{4,20}-[A-Za-z0-9]+$/u;

export function isAccountLiffUrl(value: unknown): value is string {
  return typeof value === "string" && ACCOUNT_LIFF_URL.test(value);
}

/**
 * Session marker set by the Workspace LIFF entry (`/`) when a Workspace LIFF
 * primary redirect starts. It scopes Workspace-only behavior to the LIFF
 * browser session the Workspace LIFF opened, so a MINI App or Account LIFF
 * browser that later navigates into `/app` is never treated as Workspace.
 */
export const WORKSPACE_LIFF_CONTEXT_KEY = "demi.line.workspace.context";

type ContextStore = Pick<Storage, "getItem" | "setItem">;

export function markWorkspaceLiffContext(store: ContextStore | null): void {
  try {
    store?.setItem(WORKSPACE_LIFF_CONTEXT_KEY, "1");
  } catch {
    // Storage may be unavailable; the browser then keeps the ordinary web behavior.
  }
}

export function isWorkspaceLiffContext(browser: { userAgent: string; store: Pick<Storage, "getItem"> | null }): boolean {
  if (!isLiffBrowserUserAgent(browser.userAgent)) return false;
  try {
    return browser.store?.getItem(WORKSPACE_LIFF_CONTEXT_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Where an Account link goes. Inside the Workspace LIFF browser it is the
 * Account LIFF URL, so LINE performs a supported LIFF-to-LIFF transition and
 * the Account page initializes its own LIFF ID; everywhere else (ordinary
 * browsers, the MINI App, the Account LIFF itself, missing configuration) it is
 * the existing route. Only these two values can ever be returned.
 */
export function resolveLineAccountHref(input: { workspaceLiffContext: boolean; accountLiffUrl: string | null }): string {
  return input.workspaceLiffContext && isAccountLiffUrl(input.accountLiffUrl) ? input.accountLiffUrl : LINE_ACCOUNT_PATH;
}
