/**
 * LIFF browser context: which DEMI LIFF app this browser session last entered.
 * Used only for presentation and navigation choices. It is never
 * authentication or authorization evidence: session storage is
 * client-controlled, and every destination keeps its own DEMI session and
 * server authorization checks.
 */

/** The ordinary web route of the LINE account screen (also the Account LIFF Endpoint URL path). */
export const LINE_ACCOUNT_PATH = "/line/account";
/** The ordinary web route of the DEMI work dashboard. */
export const LINE_WORKSPACE_WEB_PATH = "/app";

export const LIFF_BROWSER_CONTEXT_KEY = "demi.line.liff.context";

export type LiffBrowserApp = "WORKSPACE" | "ACCOUNT" | "MINI";
/** Workspace `liff.init()` state of the latest Workspace document in this session. */
export type WorkspaceLiffInitState = "PENDING" | "READY" | "FAILED";

export type LiffBrowserContext = {
  /** Set by an app's own entry only after `liff.isInClient()` reported the LIFF browser. */
  current: LiffBrowserApp;
  /** Sticky: the MINI App opened this browser session; its approved exits stay ordinary web. */
  mini: boolean;
  /** Null until a Workspace entry happens in this session. */
  workspace: WorkspaceLiffInitState | null;
};

type ReadableStore = Pick<Storage, "getItem">;
type WritableStore = Pick<Storage, "getItem" | "setItem">;

const APPS: ReadonlySet<string> = new Set(["WORKSPACE", "ACCOUNT", "MINI"]);
const INIT_STATES: ReadonlySet<string> = new Set(["PENDING", "READY", "FAILED"]);

/** Strict parse; anything malformed is treated as no context (ordinary web behavior). */
export function readLiffBrowserContext(store: ReadableStore | null): LiffBrowserContext | null {
  let raw: string | null;
  try {
    raw = store?.getItem(LIFF_BROWSER_CONTEXT_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw || raw.length > 256) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { current, mini, workspace } = value as Record<string, unknown>;
    if (typeof current !== "string" || !APPS.has(current) || typeof mini !== "boolean") return null;
    if (workspace !== null && (typeof workspace !== "string" || !INIT_STATES.has(workspace))) return null;
    return { current: current as LiffBrowserApp, mini, workspace: workspace as WorkspaceLiffInitState | null };
  } catch {
    return null;
  }
}

function write(store: WritableStore | null, context: LiffBrowserContext): boolean {
  try {
    store?.setItem(LIFF_BROWSER_CONTEXT_KEY, JSON.stringify(context));
    return Boolean(store);
  } catch {
    // Storage may be unavailable; the browser then keeps the ordinary web behavior.
    return false;
  }
}

/**
 * Records that this LIFF browser session entered `app`. Call only after that
 * app's SDK reported `liff.isInClient()`. A Workspace entry starts a pending
 * Workspace initialization that must survive the primary-to-secondary redirect.
 */
export function recordLiffBrowserEntry(store: WritableStore | null, app: LiffBrowserApp): boolean {
  const previous = readLiffBrowserContext(store);
  return write(store, {
    current: app,
    mini: (previous?.mini ?? false) || app === "MINI",
    workspace: app === "WORKSPACE" ? "PENDING" : previous?.workspace ?? null,
  });
}

/**
 * Records the Workspace `liff.init()` outcome of the current Workspace
 * document. Only a session that already had a Workspace entry is updated; a
 * success also makes Workspace the current app again (e.g. after returning
 * from the Account LIFF). A failure never reads as initialized.
 */
export function recordWorkspaceInitResult(store: WritableStore | null, result: "READY" | "FAILED"): boolean {
  const previous = readLiffBrowserContext(store);
  if (!previous || previous.workspace === null) return false;
  return write(store, {
    current: result === "READY" ? "WORKSPACE" : previous.current,
    mini: previous.mini,
    workspace: result,
  });
}

/**
 * Whether an `/app` or `/login` document should run Workspace `liff.init()`:
 * the session entered the Workspace LIFF (pending, ready or failed earlier)
 * and is not a MINI session. This includes returning to a Workspace page
 * from the Account LIFF. It is never consulted for authorization.
 */
export function shouldInitializeWorkspaceLiff(context: LiffBrowserContext | null): boolean {
  return context !== null && !context.mini && context.workspace !== null;
}

/** Exactly the shape `buildAccountLiffUrl()` produces; anything else is never followed as a LIFF transition. */
const ACCOUNT_LIFF_URL = /^https:\/\/liff\.line\.me\/\d{4,20}-[A-Za-z0-9]+$/u;
/** Exactly `buildWorkspaceLiffUrl("OPEN_WORK_WORKSPACE")`: the Workspace LIFF URL of the work dashboard. */
const WORKSPACE_LIFF_URL = /^https:\/\/liff\.line\.me\/\d{4,20}-[A-Za-z0-9]+\/app$/u;

export function isAccountLiffUrl(value: unknown): value is string {
  return typeof value === "string" && ACCOUNT_LIFF_URL.test(value);
}

export function isWorkspaceLiffUrl(value: unknown): value is string {
  return typeof value === "string" && WORKSPACE_LIFF_URL.test(value);
}

/**
 * True only when the current app is the Workspace LIFF and its latest
 * initialization succeeded (outside a MINI session). A pending or failed
 * initialization never counts as an initialized Workspace.
 */
export function isWorkspaceLiffContext(context: LiffBrowserContext | null): boolean {
  return context?.current === "WORKSPACE" && !context.mini && context.workspace === "READY";
}

/**
 * Workspace -> Account. Inside the Workspace LIFF it is the Account LIFF URL,
 * so LINE performs a LIFF-to-LIFF transition and the Account page initializes
 * its own LIFF ID; everywhere else (ordinary browsers, the MINI App, the
 * Account LIFF itself, missing configuration) it is the existing route. Only
 * these two values can ever be returned.
 */
export function resolveLineAccountHref(input: { context: LiffBrowserContext | null; accountLiffUrl: string | null }): string {
  return isWorkspaceLiffContext(input.context) && isAccountLiffUrl(input.accountLiffUrl) ? input.accountLiffUrl : LINE_ACCOUNT_PATH;
}

/**
 * Account -> Workspace. Inside the Account LIFF it is the Workspace LIFF URL of
 * the work dashboard, so the Workspace LIFF opens through its own Endpoint and
 * initializes its own LIFF ID; ordinary browsers, MINI sessions and missing
 * configuration keep `/app`. Only these two values can ever be returned.
 */
export function resolveLineWorkspaceHref(input: { context: LiffBrowserContext | null; workspaceLiffUrl: string | null }): string {
  const inAccountLiff = input.context?.current === "ACCOUNT" && !input.context.mini;
  return inAccountLiff && isWorkspaceLiffUrl(input.workspaceLiffUrl) ? input.workspaceLiffUrl : LINE_WORKSPACE_WEB_PATH;
}
